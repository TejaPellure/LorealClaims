import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { InvalidAiResponseError, validateAiAssessment } from '../src/modules/assessments/engine/ai-schema';
import { AssessmentPipeline } from '../src/modules/assessments/engine/assessment-pipeline';
import { retrieveEvidence } from '../src/modules/assessments/engine/evidence-retrieval';
import { buildUserPrompt, SYSTEM_PROMPT } from '../src/modules/assessments/engine/prompt';
import { ClaudeProvider, ProviderError, parseJsonText, type AssessmentProvider } from '../src/modules/assessments/engine/providers/providers';
import { candidate, claimInput, claudeAnswer } from './helpers';

const dec = (n: number) => ({ toNumber: () => n });

/** Minimal in-memory stand-in for the Prisma client, covering exactly what the pipeline calls. */
function fakePrisma(opts: { evidence?: unknown[]; existing?: { id: string } | null; ingredientPercentages?: [number, number] } = {}) {
  const created: any[] = [];
  const [first, second] = opts.ingredientPercentages ?? [10, 90];
  const claim = {
    id: 'claim-1', title: 'Increases hydration by 25% in 4 weeks', description: 'For dry skin', benefits: ['hydration'], targetValue: dec(25), measurementUnit: '%',
    durationWeeks: 4, targetPopulation: 'Adults with dry skin', productId: 'p1', formulationId: 'f1', product: { name: 'Serum' },
    formulation: { id: 'f1', ingredients: [
      { ingredientId: 'i1', percentage: dec(first), ingredient: { name: 'Glycerin', inciName: 'Glycerin', primaryFunction: 'Humectant', minConcentration: null, maxConcentration: null } },
      { ingredientId: 'i2', percentage: dec(second), ingredient: { name: 'Water', inciName: 'Aqua', primaryFunction: 'Solvent', minConcentration: null, maxConcentration: null } },
    ] },
  };
  const prisma: any = {
    claim: { findUnique: jest.fn().mockResolvedValue(claim) },
    evidence: { findMany: jest.fn().mockResolvedValue(opts.evidence ?? []) },
    assessment: {
      findFirst: jest.fn().mockResolvedValue(opts.existing ?? null),
      create: jest.fn(async ({ data }) => { created.push(data); return { id: 'new-assessment' }; }),
    },
  };
  return { prisma, created };
}

const evidenceRecord = (over: Record<string, unknown> = {}) => ({
  id: 'ev-exact', title: 'Finished product hydration study', evidenceType: 'FINISHED_PRODUCT_TRIAL', scope: 'FINISHED_PRODUCT', benefits: ['hydration'],
  sourceName: 's', doi: null, pmid: null, publishedAt: new Date('2026-01-01'), studyDesign: 'RCT', sampleSize: 40, population: 'Adults with dry skin', durationWeeks: 4,
  testedSubject: 'Serum', testedConcentration: null, endpoint: 'Hydration', resultsSummary: 'r', effectDirection: 'POSITIVE', effectMagnitude: dec(32), limitations: 'l',
  quality: 'MODERATE', status: 'VERIFIED',
  ingredientLinks: [{ ingredientId: 'i1', ingredient: { name: 'Glycerin' } }], formulationLinks: [{ formulationId: 'f1' }], ...over,
});

const claudeFor = (evidenceId: string, over: Record<string, unknown> = {}) => claudeAnswer({
  verdict: 'SUPPORTED', score: 82, ingredientEvidenceAnalysis: [], formulationEvidenceAnalysis: [{ evidenceId, note: 'Matches the claim.' }],
  evidenceRoles: [{ evidenceId, role: 'SUPPORTS' }], evidenceReferences: [evidenceId], ...over,
});
const fakeClaude = (payload: unknown): AssessmentProvider & { generate: jest.Mock } => ({ generate: jest.fn().mockResolvedValue({ payload, model: 'claude-test', raw: { ok: true } }) });

describe('evidence retrieval (facts only, no judging)', () => {
  const formulation = { id: 'f1', productName: 'Serum', ingredients: [{ ingredientId: 'i1', name: 'Glycerin', inciName: 'Glycerin', percentage: 10, function: 'Humectant', minConcentration: null, maxConcentration: null }] };

  it('labels each study as this formula, another formula or an ingredient study, and sends studies on every benefit', async () => {
    const { prisma } = fakePrisma({
      evidence: [
        evidenceRecord({ id: 'ev-ing', scope: 'INGREDIENT', formulationLinks: [], testedConcentration: dec(5) }),
        evidenceRecord({ id: 'ev-other', formulationLinks: [{ formulationId: 'other-formulation' }] }),
        evidenceRecord(),
        evidenceRecord({ id: 'ev-offtopic', scope: 'INGREDIENT', formulationLinks: [], benefits: ['anti-wrinkle'], endpoint: 'Wrinkle depth' }),
      ],
    });
    const result = await retrieveEvidence(prisma, formulation);
    const byId = Object.fromEntries(result.map((e) => [e.id, e]));
    expect(byId['ev-exact'].relation).toBe('FINISHED_EXACT');
    expect(byId['ev-other'].relation).toBe('FINISHED_OTHER');
    expect(byId['ev-ing'].relation).toBe('INGREDIENT');
    expect(byId['ev-ing'].formulatedConcentration).toBe(10);
    expect(byId['ev-offtopic']).toBeDefined(); // the backend does not decide relevance: Claude does
    expect(result.map((e) => e.id)[0]).toBe('ev-exact'); // this formula's own study is listed first
  });

  it('queries only verified evidence', async () => {
    const { prisma } = fakePrisma();
    await retrieveEvidence(prisma, formulation);
    expect(prisma.evidence.findMany.mock.calls[0][0].where.status).toEqual({ not: 'UNVERIFIED' });
  });
});

describe('Claude answer validation (shape only)', () => {
  const evidence = [candidate({ id: 'ing-1', relation: 'INGREDIENT' }), candidate({ id: 'fin-1', relation: 'FINISHED_EXACT', scope: 'FINISHED_PRODUCT' })];

  it('accepts a well-formed answer and keeps Claude\'s verdict and score untouched', () => {
    const result = validateAiAssessment(claudeAnswer({ verdict: 'SUPPORTED', score: 12 }), evidence);
    expect(result).toMatchObject({ verdict: 'SUPPORTED', score: 12 }); // no backend opinion, even when it looks odd
  });

  it('rejects fabricated evidence ids anywhere', () => {
    expect(() => validateAiAssessment(claudeAnswer({ evidenceReferences: ['made-up'] }), evidence)).toThrow(InvalidAiResponseError);
    expect(() => validateAiAssessment(claudeAnswer({ evidenceRoles: [{ evidenceId: 'nope', role: 'SUPPORTS' }] }), evidence)).toThrow(/unknown evidenceId/);
    expect(() => validateAiAssessment(claudeAnswer({ contradictoryEvidence: [{ evidenceId: 'nope', note: 'x' }] }), evidence)).toThrow(/unknown evidenceId/);
  });

  it('refuses to mix ingredient evidence with finished-product evidence', () => {
    expect(() => validateAiAssessment(claudeAnswer({ ingredientEvidenceAnalysis: [{ evidenceId: 'fin-1', note: 'x' }] }), evidence)).toThrow(/ingredient-level evidence only/);
    expect(() => validateAiAssessment(claudeAnswer({ formulationEvidenceAnalysis: [{ evidenceId: 'ing-1', note: 'x' }] }), evidence)).toThrow(/finished-product evidence only/);
  });

  it('rejects bad verdicts, out-of-range scores, bad roles and missing text', () => {
    expect(() => validateAiAssessment(claudeAnswer({ verdict: 'MAYBE' }), evidence)).toThrow(/verdict/);
    expect(() => validateAiAssessment(claudeAnswer({ score: 140 }), evidence)).toThrow(/score/);
    expect(() => validateAiAssessment(claudeAnswer({ score: 'high' }), evidence)).toThrow(/score/);
    expect(() => validateAiAssessment(claudeAnswer({ evidenceRoles: [{ evidenceId: 'ing-1', role: 'LOVES' }] }), evidence)).toThrow(/role/);
    expect(() => validateAiAssessment(claudeAnswer({ reasoning: '' }), evidence)).toThrow(/reasoning/);
    expect(() => validateAiAssessment('text', evidence)).toThrow(InvalidAiResponseError);
  });

  it('turns literal backslash-n sequences into line breaks and rounds the score', () => {
    const result = validateAiAssessment(claudeAnswer({ reasoning: 'First.\\nSecond.', score: 61.6 }), evidence);
    expect(result.reasoning).toBe('First.\nSecond.');
    expect(result.score).toBe(62);
  });
});

describe('assessment pipeline', () => {
  it('stores exactly what Claude said, with snapshots and the role Claude gave each study', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord(), evidenceRecord({ id: 'ev-bg', scope: 'INGREDIENT', formulationLinks: [], benefits: ['anti-wrinkle'] })] });
    const provider = fakeClaude(claudeFor('ev-exact', { score: 88, evidenceRoles: [{ evidenceId: 'ev-exact', role: 'SUPPORTS' }, { evidenceId: 'ev-bg', role: 'BACKGROUND' }] }));

    const result = await new AssessmentPipeline(prisma, provider).run('claim-1');

    expect(result).toEqual({ id: 'new-assessment', reused: false });
    const saved = created[0];
    expect(saved).toMatchObject({ model: 'claude-test', verdict: 'SUPPORTED', evidenceScore: 88, scoreExplanation: 'Only ingredient studies exist.', claimId: 'claim-1', formulationId: 'f1' });
    expect(saved.evidence.create).toEqual([
      expect.objectContaining({ evidenceId: 'ev-exact', role: 'SUPPORTING', note: 'Matches the claim.' }),
      expect.objectContaining({ evidenceId: 'ev-bg', role: 'CONTEXT' }),
    ]);
    expect(saved.claimSnapshot.title).toMatch(/hydration/i);
    expect(saved.formulationSnapshot.ingredients).toHaveLength(2);
    expect(saved.evidenceSnapshot).toHaveLength(2);
    expect(saved.inputHash).toHaveLength(64);
  });

  it('does not override Claude: a SUPPORTED verdict is saved as given, with no backend rules applied', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord({ scope: 'INGREDIENT', formulationLinks: [] })] });
    await new AssessmentPipeline(prisma, fakeClaude(claudeFor('ev-exact', { verdict: 'SUPPORTED', score: 90, formulationEvidenceAnalysis: [], ingredientEvidenceAnalysis: [{ evidenceId: 'ev-exact', note: 'x' }] }))).run('claim-1');
    expect(created[0].verdict).toBe('SUPPORTED');
    expect(created[0].evidenceScore).toBe(90);
  });

  it('sends the claim, formula and every evidence record to Claude, and no score of its own', async () => {
    const { prisma } = fakePrisma({ evidence: [evidenceRecord()] });
    const provider = fakeClaude(claudeFor('ev-exact'));
    await new AssessmentPipeline(prisma, provider).run('claim-1');
    const input = provider.generate.mock.calls[0][0];
    expect(Object.keys(input)).not.toContain('score');
    expect(input.package.evidence[0].id).toBe('ev-exact');
    expect(input.package.claim.description).toBe('For dry skin');
  });

  it('returns the existing assessment for a duplicate submission instead of creating another', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord()], existing: { id: 'already-there' } });
    const provider = fakeClaude(claudeFor('ev-exact'));
    expect(await new AssessmentPipeline(prisma, provider).run('claim-1')).toEqual({ id: 'already-there', reused: true });
    expect(created).toHaveLength(0);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('shares one in-flight run between concurrent identical submissions', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord()] });
    const provider = fakeClaude(claudeFor('ev-exact'));
    const pipeline = new AssessmentPipeline(prisma, provider);
    await Promise.all([pipeline.run('claim-1'), pipeline.run('claim-1')]);
    expect(created).toHaveLength(1);
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it('refuses a claim whose formulation does not total 100%', async () => {
    const { prisma } = fakePrisma({ ingredientPercentages: [10, 50] });
    await expect(new AssessmentPipeline(prisma, fakeClaude(claudeFor('x'))).run('claim-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retries once with validation feedback, then fails with 502 when Claude keeps returning invalid output', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord()] });
    const provider = fakeClaude({ verdict: 'SUPPORTED' });
    await expect(new AssessmentPipeline(prisma, provider).run('claim-1')).rejects.toBeInstanceOf(BadGatewayException);
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(provider.generate.mock.calls[1][0].feedback.length).toBeGreaterThan(0);
    expect(created).toHaveLength(0); // nothing unvalidated is ever saved
  });

  it('rejects answers that cite evidence ids Claude was never given', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord()] });
    await expect(new AssessmentPipeline(prisma, fakeClaude(claudeFor('ev-exact', { evidenceReferences: ['made-up-id'] }))).run('claim-1')).rejects.toBeInstanceOf(BadGatewayException);
    expect(created).toHaveLength(0);
  });
});

describe('prompt', () => {
  const pkg = {
    claim: claimInput({ description: 'For oily skin', benefits: ['pores'], targetValue: null, durationWeeks: null, targetPopulation: null }),
    formulation: { id: 'f', productName: 'Serum', ingredients: [{ ingredientId: 'i', name: 'Niacinamide', inciName: 'Niacinamide', percentage: 5, function: 'Skin-conditioning active', minConcentration: null, maxConcentration: null }] },
    evidence: [candidate()],
  };

  it('sends the wording, description and benefits, and leaves out fields the user did not give', () => {
    const claim = JSON.parse(buildUserPrompt(pkg).split('\n\n')[1]).claim;
    expect(claim).toMatchObject({ wording: pkg.claim.title, description: 'For oily skin', benefits: ['pores'] });
    for (const absent of ['target', 'durationWeeks', 'population']) expect(claim).not.toHaveProperty(absent);
  });

  it('asks Claude for the score, the per-study roles and plain language, and carries the playbook', () => {
    expect(SYSTEM_PROMPT).toMatch(/score is an integer from 0 to 100/);
    expect(SYSTEM_PROMPT).toMatch(/evidenceRoles/);
    expect(SYSTEM_PROMPT).toMatch(/non-scientists/);
    expect(SYSTEM_PROMPT).toMatch(/EVALUATION PLAYBOOK/);
    expect(SYSTEM_PROMPT).not.toMatch(/scoring is done elsewhere/i);
    expect(buildUserPrompt(pkg)).toContain('Skin-conditioning active');
  });
});

describe('Claude provider (bridge mocked)', () => {
  const provider = new ClaudeProvider({ bridgeUrl: 'http://bridge', bridgeToken: 'tok', model: 'sonnet', timeoutMs: 50 });
  const input = { package: { claim: claimInput(), formulation: { id: 'f', productName: 'P', ingredients: [] }, evidence: [candidate()] } };
  const respond = (status: number, body: unknown) => jest.spyOn(global, 'fetch').mockResolvedValue({ ok: status < 400, status, json: async () => body } as Response);
  afterEach(() => jest.restoreAllMocks());

  it('returns structured output from the bridge and sends the bearer token', async () => {
    const spy = respond(200, { structured: { verdict: 'INCONCLUSIVE' }, model: 'sonnet' });
    const out = await provider.generate(input);
    expect(out.payload).toEqual({ verdict: 'INCONCLUSIVE' });
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok' });
  });

  it('sends the system prompt, JSON schema (with score and roles) and model to the bridge', async () => {
    const spy = respond(200, { structured: {} });
    await provider.generate(input);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.systemPrompt).toMatch(/Ingredient-level evidence does NOT prove/);
    expect(body.jsonSchema.required).toEqual(expect.arrayContaining(['verdict', 'score', 'evidenceRoles']));
    expect(body.model).toBe('sonnet');
  });

  it('falls back to JSON embedded in text', async () => {
    respond(200, { text: 'Here you go:\n```json\n{"verdict":"INCONCLUSIVE"}\n```' });
    expect((await provider.generate(input)).payload).toEqual({ verdict: 'INCONCLUSIVE' });
    expect(() => parseJsonText('not json')).toThrow(ProviderError);
  });

  it('maps bridge failures to provider errors, surfacing the CLI message', async () => {
    respond(401, {});
    await expect(provider.generate(input)).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
    respond(502, { error: 'Failed to authenticate: OAuth session expired' });
    await expect(provider.generate(input)).rejects.toThrow(/OAuth session expired/);
    respond(200, { refusal: true });
    await expect(provider.generate(input)).rejects.toMatchObject({ kind: 'REFUSAL' });
    jest.spyOn(global, 'fetch').mockRejectedValue(Object.assign(new Error('abort'), { name: 'AbortError' }));
    await expect(provider.generate(input)).rejects.toMatchObject({ kind: 'TIMEOUT' });
  });

  it('surfaces an unreachable bridge as 503 through the pipeline', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const { prisma } = fakePrisma({ evidence: [evidenceRecord()] });
    await expect(new AssessmentPipeline(prisma, provider).run('claim-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('is unavailable without a configured token', async () => {
    const noToken = new ClaudeProvider({ bridgeUrl: 'http://bridge', bridgeToken: '', model: 'sonnet', timeoutMs: 50 });
    await expect(noToken.generate(input)).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
  });
});

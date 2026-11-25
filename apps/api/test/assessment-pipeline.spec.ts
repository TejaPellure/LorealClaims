import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { DEFAULT_SCORING_WEIGHTS } from '../src/common/config';
import { AssessmentPipeline } from '../src/modules/assessments/engine/assessment-pipeline';
import { ClaudeProvider, ProviderError, parseJsonText, type AssessmentProvider } from '../src/modules/assessments/engine/providers/providers';
import { retrieveEvidence } from '../src/modules/assessments/engine/evidence-retrieval';
import { candidate, claimInput } from './helpers';

const dec = (n: number) => ({ toNumber: () => n });
const config = { weights: DEFAULT_SCORING_WEIGHTS, supportedMinScore: 60 };

/** Minimal in-memory stand-in for the Prisma client, covering exactly what the pipeline calls. */
function fakePrisma(opts: { evidence?: unknown[]; existing?: { id: string } | null; ingredientPercentages?: [number, number] } = {}) {
  const created: any[] = [];
  const [first, second] = opts.ingredientPercentages ?? [10, 90];
  const claim = {
    id: 'claim-1', title: 'Increases hydration by 25% in 4 weeks', benefitCategory: 'HYDRATION', measurementEndpoint: 'Skin hydration (corneometry)',
    targetValue: dec(25), measurementUnit: '%', durationWeeks: 4, targetPopulation: 'Adults with dry skin', productId: 'p1', formulationId: 'f1', product: { name: 'Serum' },
    formulation: { id: 'f1', ingredients: [
      { ingredientId: 'i1', percentage: dec(first), ingredient: { name: 'Glycerin', inciName: 'Glycerin' } },
      { ingredientId: 'i2', percentage: dec(second), ingredient: { name: 'Water', inciName: 'Aqua' } },
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
  id: 'ev-exact', title: 'Finished product hydration study', evidenceType: 'FINISHED_PRODUCT_TRIAL', scope: 'FINISHED_PRODUCT', benefitCategories: ['HYDRATION'],
  sourceName: 's', doi: null, pmid: null, publishedAt: new Date('2026-01-01'), studyDesign: 'RCT', sampleSize: 40, population: 'Adults with dry skin', durationWeeks: 4,
  testedSubject: 'Serum', testedConcentration: null, endpoint: 'Hydration', resultsSummary: 'r', effectDirection: 'POSITIVE', effectMagnitude: dec(32), limitations: 'l',
  quality: 'MODERATE', status: 'VERIFIED',
  ingredientLinks: [{ ingredientId: 'i1', ingredient: { name: 'Glycerin' } }], formulationLinks: [{ formulationId: 'f1' }], ...over,
});

/** A schema-valid answer as Claude would return it, citing the given evidence ids. */
const claudeAnswer = (over: Record<string, unknown> = {}) => ({
  verdict: 'SUPPORTED', summary: 'Supported by finished-product data.', strengths: ['Direct study'], limitations: [], ingredientEvidenceAnalysis: [],
  formulationEvidenceAnalysis: [{ evidenceId: 'ev-exact', note: 'Matches the claim.' }], contradictoryEvidence: [], missingEvidence: [], recommendedTests: [],
  evidenceReferences: ['ev-exact'], reasoning: 'Reasoning.', ...over,
});

const fakeClaude = (payload: unknown): AssessmentProvider & { generate: jest.Mock } => ({ generate: jest.fn().mockResolvedValue({ payload, model: 'claude-test', raw: { ok: true } }) });

describe('evidence retrieval classifies ingredient vs finished-product evidence', () => {
  const claim = claimInput({ benefitCategory: 'HYDRATION', targetPopulation: 'Adults with dry skin', durationWeeks: 4, targetValue: 25 });
  const formulation = { id: 'f1', productName: 'Serum', ingredients: [{ ingredientId: 'i1', name: 'Glycerin', inciName: 'Glycerin', percentage: 10 }] };

  it('marks a study linked to this formulation as FINISHED_EXACT, another formula as FINISHED_OTHER, and ingredient studies as INGREDIENT', async () => {
    const { prisma } = fakePrisma({
      evidence: [
        evidenceRecord(),
        evidenceRecord({ id: 'ev-other', formulationLinks: [{ formulationId: 'other-formulation' }] }),
        evidenceRecord({ id: 'ev-ing', scope: 'INGREDIENT', formulationLinks: [], testedConcentration: dec(5), effectMagnitude: dec(18) }),
        evidenceRecord({ id: 'ev-offtopic', scope: 'INGREDIENT', formulationLinks: [], benefitCategories: ['ANTI_WRINKLE'] }),
      ],
    });
    const result = await retrieveEvidence(prisma, claim, formulation);
    const byId = Object.fromEntries(result.map((e) => [e.id, e]));
    expect(byId['ev-exact'].relation).toBe('FINISHED_EXACT');
    expect(byId['ev-other'].relation).toBe('FINISHED_OTHER');
    expect(byId['ev-ing'].relation).toBe('INGREDIENT');
    expect(byId['ev-ing'].formulatedConcentration).toBe(10);
    expect(byId['ev-offtopic']).toBeUndefined(); // different endpoint and not this formula: irrelevant
  });

  it('classifies neutral results as contradictory and never drops them for supporting ones', async () => {
    const { prisma } = fakePrisma({ evidence: [evidenceRecord({ id: 'ev-null', effectDirection: 'NEUTRAL' }), evidenceRecord({ id: 'ev-pos' })] });
    const result = await retrieveEvidence(prisma, claim, formulation);
    expect(result[0].id).toBe('ev-null');
    expect(result[0].role).toBe('CONTRADICTORY');
  });

  it('queries only verified evidence', async () => {
    const { prisma } = fakePrisma();
    await retrieveEvidence(prisma, claim, formulation);
    expect(prisma.evidence.findMany.mock.calls[0][0].where.status).toEqual({ not: 'UNVERIFIED' });
  });
});

describe('assessment pipeline', () => {
  it('persists the assessment with snapshots and evidence references', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord()] });
    const provider = fakeClaude(claudeAnswer());

    const result = await new AssessmentPipeline(prisma, provider, config).run('claim-1');

    expect(result).toEqual({ id: 'new-assessment', reused: false });
    const saved = created[0];
    expect(saved).toMatchObject({ model: 'claude-test', verdict: 'SUPPORTED', claimId: 'claim-1', formulationId: 'f1' });
    expect(saved.evidenceScore).toBeGreaterThan(60);
    expect(saved.evidence.create).toEqual([expect.objectContaining({ evidenceId: 'ev-exact', role: 'SUPPORTING', note: 'Matches the claim.' })]);
    expect(saved.claimSnapshot.title).toMatch(/hydration/i);
    expect(saved.formulationSnapshot.ingredients).toHaveLength(2);
    expect(saved.evidenceSnapshot).toHaveLength(1);
    expect(saved.inputHash).toHaveLength(64);
  });

  it('sends the evidence package (not client data) to Claude and no score', async () => {
    const { prisma } = fakePrisma({ evidence: [evidenceRecord()] });
    const provider = fakeClaude(claudeAnswer());
    await new AssessmentPipeline(prisma, provider, config).run('claim-1');
    const input = provider.generate.mock.calls[0][0];
    expect(input.package.evidence[0].id).toBe('ev-exact');
    expect(input.package.claim.title).toMatch(/hydration/i);
  });

  it('downgrades SUPPORTED when only ingredient evidence exists (guardrail) and records the note', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord({ scope: 'INGREDIENT', formulationLinks: [] })] });
    await new AssessmentPipeline(prisma, fakeClaude(claudeAnswer({ formulationEvidenceAnalysis: [] })), config).run('claim-1');
    expect(created[0].verdict).toBe('INCONCLUSIVE');
    expect(created[0].guardrailNotes[0]).toMatch(/downgraded/);
  });

  it('returns the existing assessment for a duplicate submission instead of creating another', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord()], existing: { id: 'already-there' } });
    const provider = fakeClaude(claudeAnswer());
    const result = await new AssessmentPipeline(prisma, provider, config).run('claim-1');
    expect(result).toEqual({ id: 'already-there', reused: true });
    expect(created).toHaveLength(0);
    expect(provider.generate).not.toHaveBeenCalled();
  });

  it('shares one in-flight run between concurrent identical submissions', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord()] });
    const provider = fakeClaude(claudeAnswer());
    const pipeline = new AssessmentPipeline(prisma, provider, config);
    await Promise.all([pipeline.run('claim-1'), pipeline.run('claim-1')]);
    expect(created).toHaveLength(1);
    expect(provider.generate).toHaveBeenCalledTimes(1);
  });

  it('refuses a claim whose formulation does not total 100%', async () => {
    const { prisma } = fakePrisma({ ingredientPercentages: [10, 50] });
    await expect(new AssessmentPipeline(prisma, fakeClaude(claudeAnswer()), config).run('claim-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retries once with validation feedback, then fails with 502 when Claude keeps returning invalid output', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord()] });
    const provider = fakeClaude({ verdict: 'SUPPORTED' });
    await expect(new AssessmentPipeline(prisma, provider, config).run('claim-1')).rejects.toBeInstanceOf(BadGatewayException);
    expect(provider.generate).toHaveBeenCalledTimes(2);
    expect(provider.generate.mock.calls[1][0].feedback.length).toBeGreaterThan(0);
    expect(created).toHaveLength(0); // nothing unvalidated is ever saved
  });

  it('rejects answers that cite evidence ids Claude was never given', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord()] });
    await expect(new AssessmentPipeline(prisma, fakeClaude(claudeAnswer({ evidenceReferences: ['made-up-id'] })), config).run('claim-1')).rejects.toBeInstanceOf(BadGatewayException);
    expect(created).toHaveLength(0);
  });
});

describe('Claude provider (bridge mocked)', () => {
  const provider = new ClaudeProvider({ bridgeUrl: 'http://bridge', bridgeToken: 'tok', model: 'sonnet', timeoutMs: 50 });
  const input = { package: { claim: claimInput(), formulation: { id: 'f', productName: 'P', ingredients: [] }, evidence: [candidate()] }, score: {} as never };
  const respond = (status: number, body: unknown) => jest.spyOn(global, 'fetch').mockResolvedValue({ ok: status < 400, status, json: async () => body } as Response);
  afterEach(() => jest.restoreAllMocks());

  it('returns structured output from the bridge and sends the bearer token', async () => {
    const spy = respond(200, { structured: { verdict: 'INCONCLUSIVE' }, model: 'sonnet' });
    const out = await provider.generate(input);
    expect(out.payload).toEqual({ verdict: 'INCONCLUSIVE' });
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok' });
  });

  it('sends the system prompt, JSON schema and model to the bridge', async () => {
    const spy = respond(200, { structured: {} });
    await provider.generate(input);
    const body = JSON.parse((spy.mock.calls[0][1] as RequestInit).body as string);
    expect(body.systemPrompt).toMatch(/Ingredient-level evidence does NOT prove/);
    expect(body.jsonSchema.required).toContain('verdict');
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
    await expect(new AssessmentPipeline(prisma, provider, config).run('claim-1')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('is unavailable without a configured token', async () => {
    const noToken = new ClaudeProvider({ bridgeUrl: 'http://bridge', bridgeToken: '', model: 'sonnet', timeoutMs: 50 });
    await expect(noToken.generate(input)).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
  });
});

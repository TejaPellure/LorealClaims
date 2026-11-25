import { BadGatewayException, BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { DEFAULT_SCORING_WEIGHTS } from '../src/common/config';
import { AssessmentPipeline } from '../src/modules/assessments/engine/assessment-pipeline';
import { ClaudeProvider, MockProvider, ProviderError, parseJsonText } from '../src/modules/assessments/engine/providers/providers';
import { retrieveEvidence } from '../src/modules/assessments/engine/evidence-retrieval';
import { candidate, claimInput } from './helpers';

const dec = (n: number) => ({ toNumber: () => n });
const config = { provider: 'mock' as const, weights: DEFAULT_SCORING_WEIGHTS, supportedMinScore: 60 };

/** Minimal in-memory stand-in for the Prisma client, covering exactly what the pipeline calls. */
function fakePrisma(opts: { evidence?: unknown[]; claimStatus?: string; existing?: { id: string } | null } = {}) {
  const created: any[] = [];
  const claimUpdates: any[] = [];
  const claim = {
    id: 'claim-1', title: 'Increases hydration by 25% in 4 weeks', description: 'd', benefitCategory: 'HYDRATION', targetOutcome: 'o', measurementEndpoint: 'Corneometer',
    targetValue: dec(25), measurementUnit: '%', durationWeeks: 4, targetPopulation: 'Adults with dry skin', applicationFrequency: null, scientificContext: null,
    status: opts.claimStatus ?? 'READY_FOR_ASSESSMENT', productId: 'p1', formulationId: 'f1', product: { name: 'Serum' },
    formulation: { id: 'f1', version: 1, basis: 'ILLUSTRATIVE', ingredients: [
      { ingredientId: 'i1', percentage: dec(10), ingredient: { name: 'Glycerin', inciName: 'Glycerin' } },
      { ingredientId: 'i2', percentage: dec(90), ingredient: { name: 'Water', inciName: 'Aqua' } },
    ] },
  };
  const prisma: any = {
    claim: { findUnique: jest.fn().mockResolvedValue(claim), update: jest.fn(async (a) => claimUpdates.push(a)) },
    evidence: { findMany: jest.fn().mockResolvedValue(opts.evidence ?? []) },
    assessment: {
      findFirst: jest.fn().mockResolvedValue(opts.existing ?? null),
      create: jest.fn(async ({ data }) => { created.push(data); return { id: 'new-assessment' }; }),
    },
    $transaction: jest.fn(async (cb) => cb(prisma)),
  };
  return { prisma, created, claimUpdates };
}

const evidenceRecord = (over: Record<string, unknown> = {}) => ({
  id: 'ev-exact', title: 'Finished product hydration study', evidenceType: 'FINISHED_PRODUCT_TRIAL', scope: 'FINISHED_PRODUCT', benefitCategories: ['HYDRATION'],
  sourceName: 's', doi: null, pmid: null, publishedAt: new Date('2026-01-01'), studyDesign: 'RCT', sampleSize: 40, population: 'Adults with dry skin', durationWeeks: 4,
  testedSubject: 'Serum v1', testedConcentration: null, endpoint: 'Hydration', resultsSummary: 'r', effectDirection: 'POSITIVE', effectMagnitude: dec(32), limitations: 'l',
  quality: 'MODERATE', status: 'DEMO',
  ingredientLinks: [{ ingredientId: 'i1', ingredient: { name: 'Glycerin' } }], formulationLinks: [{ formulationId: 'f1' }], ...over,
});

describe('evidence retrieval classifies ingredient vs finished-product evidence', () => {
  const claim = claimInput({ benefitCategory: 'HYDRATION', targetPopulation: 'Adults with dry skin', durationWeeks: 4, targetValue: 25 });
  const formulation = { id: 'f1', productName: 'Serum', version: 1, basis: 'ILLUSTRATIVE', ingredients: [{ ingredientId: 'i1', name: 'Glycerin', inciName: 'Glycerin', percentage: 10 }] };

  it('marks a study linked to this version as FINISHED_EXACT, another formula as FINISHED_OTHER, and ingredient studies as INGREDIENT', async () => {
    const { prisma } = fakePrisma({
      evidence: [
        evidenceRecord(),
        evidenceRecord({ id: 'ev-other', formulationLinks: [{ formulationId: 'other-version' }] }),
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
    expect(byId['ev-offtopic']).toBeUndefined(); // different endpoint, not this version: irrelevant
  });

  it('classifies neutral results as contradictory and never drops them for supporting ones', async () => {
    const { prisma } = fakePrisma({ evidence: [evidenceRecord({ id: 'ev-null', effectDirection: 'NEUTRAL' }), evidenceRecord({ id: 'ev-pos' })] });
    const result = await retrieveEvidence(prisma, claim, formulation);
    expect(result[0].id).toBe('ev-null');
    expect(result[0].role).toBe('CONTRADICTORY');
  });
});

describe('assessment pipeline', () => {
  it('persists the assessment with snapshots, evidence references and moves the claim to ASSESSED', async () => {
    const { prisma, created, claimUpdates } = fakePrisma({ evidence: [evidenceRecord()] });
    const pipeline = new AssessmentPipeline(prisma, new MockProvider(60), config);

    const result = await pipeline.run('claim-1', {}, 'EVALUATOR');

    expect(result).toEqual({ id: 'new-assessment', reused: false });
    const saved = created[0];
    expect(saved).toMatchObject({ provider: 'MOCK', model: 'mock-rules-v1', verdict: 'SUPPORTED', createdBy: 'EVALUATOR', claimId: 'claim-1', formulationId: 'f1' });
    expect(saved.evidenceScore).toBeGreaterThan(60);
    expect(saved.evidence.create).toEqual([expect.objectContaining({ evidenceId: 'ev-exact', role: 'SUPPORTING' })]);
    expect(saved.claimSnapshot.title).toMatch(/hydration/i);
    expect(saved.formulationSnapshot.ingredients).toHaveLength(2);
    expect(saved.evidenceSnapshot).toHaveLength(1);
    expect(saved.inputHash).toHaveLength(64);
    expect(claimUpdates[0].data).toEqual({ status: 'ASSESSED' });
  });

  it('returns INCONCLUSIVE (not NOT_SUPPORTED) when only ingredient evidence exists', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord({ scope: 'INGREDIENT', formulationLinks: [], testedConcentration: dec(5) })] });
    await new AssessmentPipeline(prisma, new MockProvider(60), config).run('claim-1', {}, 'x');
    expect(created[0].verdict).toBe('INCONCLUSIVE');
    expect(created[0].missingEvidence.join(' ')).toMatch(/No finished-product study/);
  });

  it('returns the existing assessment for a duplicate submission instead of creating another', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord()], existing: { id: 'already-there' } });
    const result = await new AssessmentPipeline(prisma, new MockProvider(60), config).run('claim-1', {}, 'x');
    expect(result).toEqual({ id: 'already-there', reused: true });
    expect(created).toHaveLength(0);
  });

  it('shares one in-flight run between concurrent identical submissions', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord()] });
    const pipeline = new AssessmentPipeline(prisma, new MockProvider(60), config);
    await Promise.all([pipeline.run('claim-1', {}, 'x'), pipeline.run('claim-1', {}, 'x')]);
    expect(created).toHaveLength(1);
  });

  it('refuses claims that are not ready or not in an assessable status', async () => {
    const draft = fakePrisma({ claimStatus: 'DRAFT' });
    await expect(new AssessmentPipeline(draft.prisma, new MockProvider(60), config).run('claim-1', {}, 'x')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('retries once with validation feedback, then fails with 502 when the model keeps returning invalid output', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord()] });
    const generate = jest.fn().mockResolvedValue({ payload: { verdict: 'SUPPORTED' }, model: 'm', raw: {} });
    const pipeline = new AssessmentPipeline(prisma, { kind: 'CLAUDE', generate }, config);
    await expect(pipeline.run('claim-1', {}, 'x')).rejects.toBeInstanceOf(BadGatewayException);
    expect(generate).toHaveBeenCalledTimes(2);
    expect(generate.mock.calls[1][0].feedback.length).toBeGreaterThan(0);
    expect(created).toHaveLength(0); // nothing unvalidated is ever saved
  });

  it('applies guardrails to an over-confident model verdict and records the note', async () => {
    const { prisma, created } = fakePrisma({ evidence: [evidenceRecord({ scope: 'INGREDIENT', formulationLinks: [] })] });
    const overConfident = {
      verdict: 'SUPPORTED', summary: 's', strengths: [], limitations: [], ingredientEvidenceAnalysis: [], formulationEvidenceAnalysis: [], contradictoryEvidence: [],
      missingEvidence: [], recommendedTests: [], evidenceReferences: ['ev-exact'], reasoning: 'r',
    };
    const provider = { kind: 'CLAUDE' as const, generate: jest.fn().mockResolvedValue({ payload: overConfident, model: 'claude-x', raw: { ok: true } }) };
    await new AssessmentPipeline(prisma, provider, config).run('claim-1', {}, 'x');
    expect(created[0].verdict).toBe('INCONCLUSIVE');
    expect(created[0].guardrailNotes[0]).toMatch(/downgraded/);
    expect(created[0].provider).toBe('CLAUDE');
  });
});

describe('Claude provider (bridge mocked)', () => {
  const provider = new ClaudeProvider({ bridgeUrl: 'http://bridge', bridgeToken: 'tok', model: 'sonnet', timeoutMs: 50 });
  const input = { package: { claim: claimInput(), formulation: { id: 'f', productName: 'P', version: 1, basis: 'ILLUSTRATIVE', ingredients: [] }, evidence: [candidate()] }, score: {} as never };
  const respond = (status: number, body: unknown) => jest.spyOn(global, 'fetch').mockResolvedValue({ ok: status < 400, status, json: async () => body } as Response);
  afterEach(() => jest.restoreAllMocks());

  it('returns structured output from the bridge and sends the bearer token', async () => {
    const spy = respond(200, { structured: { verdict: 'INCONCLUSIVE' }, model: 'sonnet' });
    const out = await provider.generate(input);
    expect(out.payload).toEqual({ verdict: 'INCONCLUSIVE' });
    expect((spy.mock.calls[0][1] as RequestInit).headers).toMatchObject({ authorization: 'Bearer tok' });
  });

  it('falls back to JSON embedded in text', async () => {
    respond(200, { text: 'Here you go:\n```json\n{"verdict":"INCONCLUSIVE"}\n```' });
    expect((await provider.generate(input)).payload).toEqual({ verdict: 'INCONCLUSIVE' });
    expect(() => parseJsonText('not json')).toThrow(ProviderError);
  });

  it('maps bridge failures to provider errors (and HTTP 503/422)', async () => {
    respond(401, {});
    await expect(provider.generate(input)).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
    respond(200, { refusal: true });
    await expect(provider.generate(input)).rejects.toMatchObject({ kind: 'REFUSAL' });
    jest.spyOn(global, 'fetch').mockRejectedValue(Object.assign(new Error('abort'), { name: 'AbortError' }));
    await expect(provider.generate(input)).rejects.toMatchObject({ kind: 'TIMEOUT' });
  });

  it('surfaces an unreachable bridge as 503 through the pipeline', async () => {
    jest.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));
    const { prisma } = fakePrisma({ evidence: [evidenceRecord()] });
    await expect(new AssessmentPipeline(prisma, provider, config).run('claim-1', {}, 'x')).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('is unavailable without a configured token', async () => {
    const noToken = new ClaudeProvider({ bridgeUrl: 'http://bridge', bridgeToken: '', model: 'sonnet', timeoutMs: 50 });
    await expect(noToken.generate(input)).rejects.toMatchObject({ kind: 'UNAVAILABLE' });
  });
});

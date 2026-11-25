import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { AssessmentsController, AssessmentsService, ClaimAssessmentController } from '../src/modules/assessments/assessments.module';
import { ClaimsController, ClaimsService } from '../src/modules/claims/claims.module';
import { FormulationsController, FormulationsService } from '../src/modules/formulations/formulations.module';
import { seedIfEmpty, validateDemoData } from '../../../prisma/seed';

const demoData = JSON.parse(readFileSync(join(__dirname, '../../../prisma/seed-data/demo-data.json'), 'utf8'));

describe('demo dataset and seeding', () => {
  it('is a valid dataset: references resolve and every formula totals 100%', () => {
    expect(() => validateDemoData(demoData)).not.toThrow();
    expect(demoData.ingredients.length).toBeGreaterThanOrEqual(10);
    expect(demoData.evidence.length).toBeGreaterThanOrEqual(12);
    expect(demoData.products.length).toBe(3);
    expect(demoData.claims.length).toBeGreaterThanOrEqual(4);
  });

  it('never presents invented DOIs: every demo record has no DOI/PMID, and formulas are ILLUSTRATIVE', () => {
    for (const e of demoData.evidence.filter((e: any) => e.status === 'DEMO')) expect([e.doi, e.pmid]).toEqual([null, null]);
    for (const p of demoData.products) for (const f of p.formulations) expect(f.basis).toBe('ILLUSTRATIVE');
  });

  it('rejects a dataset whose formula does not total 100%', () => {
    const broken = JSON.parse(JSON.stringify(demoData));
    broken.products[0].formulations[0].ingredients[0].percentage = 50;
    expect(() => validateDemoData(broken)).toThrow(/Under-allocated|Over-allocated/);
  });

  /** Fake client exposing only the calls seedIfEmpty makes before deciding to skip. */
  const clientWithCounts = (counts: { ingredient: number; evidence: number; product: number }) =>
    ({
      ingredient: { count: jest.fn().mockResolvedValue(counts.ingredient) },
      evidence: { count: jest.fn().mockResolvedValue(counts.evidence) },
      product: { count: jest.fn().mockResolvedValue(counts.product) },
      assessment: { count: jest.fn().mockResolvedValue(1) }, // already has assessments: nothing to recover
      $transaction: jest.fn(),
    }) as any;

  it('is idempotent: a non-empty database is left completely untouched', async () => {
    const prisma = clientWithCounts({ ingredient: 3, evidence: 0, product: 0 });
    expect(await seedIfEmpty(prisma, demoData, () => undefined)).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('seeds an empty database in a single transaction', async () => {
    const prisma = clientWithCounts({ ingredient: 0, evidence: 0, product: 0 });
    prisma.$transaction.mockResolvedValue(undefined);
    expect(await seedIfEmpty(prisma, demoData, () => undefined)).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('HTTP API (services mocked)', () => {
  let app: INestApplication;
  const assessments = { assess: jest.fn(), get: jest.fn(), list: jest.fn(), meta: jest.fn(), forClaim: jest.fn(), review: jest.fn() };
  const claims = { setStatus: jest.fn(), list: jest.fn(), get: jest.fn(), create: jest.fn(), update: jest.fn() };
  const formulations = { compare: jest.fn(), get: jest.fn(), create: jest.fn(), createVersion: jest.fn(), update: jest.fn(), listForProduct: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ClaimAssessmentController, AssessmentsController, ClaimsController, FormulationsController],
      providers: [{ provide: AssessmentsService, useValue: assessments }, { provide: ClaimsService, useValue: claims }, { provide: FormulationsService, useValue: formulations }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const claimId = '3f0c1f5e-2b1a-4c3d-9e8f-1a2b3c4d5e6f';

  it('POST /api/claims/assess passes only the claim id and persona to the service and returns its result', async () => {
    assessments.assess.mockResolvedValue({ id: 'a1', verdict: 'INCONCLUSIVE', evidenceScore: 40 });
    const res = await request(app.getHttpServer()).post('/api/claims/assess').set('x-demo-persona', 'EVALUATOR').send({ claimId }).expect(201);
    expect(res.body).toMatchObject({ id: 'a1', verdict: 'INCONCLUSIVE' });
    expect(assessments.assess).toHaveBeenCalledWith({ claimId }, 'EVALUATOR');
  });

  it('POST /api/claims/assess rejects invalid input and client-supplied evidence with a consistent error body', async () => {
    const bad = await request(app.getHttpServer()).post('/api/claims/assess').send({ claimId: 'not-a-uuid' }).expect(400);
    expect(bad.body).toMatchObject({ statusCode: 400, message: 'Validation failed', path: '/api/claims/assess' });
    expect(bad.body.details.length).toBeGreaterThan(0);
    await request(app.getHttpServer()).post('/api/claims/assess').send({ claimId, evidence: [{ id: 'fake' }] }).expect(400); // client may not supply evidence
    expect(assessments.assess).not.toHaveBeenCalled();
  });

  it('GET /api/assessments/meta is routed before /:id', async () => {
    assessments.meta.mockReturnValue({ provider: 'MOCK', isMock: true });
    const res = await request(app.getHttpServer()).get('/api/assessments/meta').expect(200);
    expect(res.body.isMock).toBe(true);
    expect(assessments.get).not.toHaveBeenCalled();
  });

  it('PATCH /api/assessments/:id/review validates the decision enum', async () => {
    await request(app.getHttpServer()).patch('/api/assessments/' + claimId + '/review').send({ decision: 'MAYBE' }).expect(400);
    assessments.review.mockResolvedValue({ id: claimId, reviewDecision: 'APPROVED' });
    await request(app.getHttpServer()).patch('/api/assessments/' + claimId + '/review').set('x-demo-persona', 'EVALUATOR').send({ decision: 'APPROVED' }).expect(200);
    expect(assessments.review).toHaveBeenCalledWith(claimId, { decision: 'APPROVED' }, 'EVALUATOR');
  });

  it('PATCH /api/claims/:id/status validates the status value', async () => {
    await request(app.getHttpServer()).patch(`/api/claims/${claimId}/status`).send({ status: 'NOPE' }).expect(400);
    claims.setStatus.mockResolvedValue({ id: claimId, status: 'SUBMITTED' });
    await request(app.getHttpServer()).patch(`/api/claims/${claimId}/status`).send({ status: 'SUBMITTED' }).expect(200);
  });

  it('POST /api/formulations validates percentages and GET /api/formulations/compare is routed before /:id', async () => {
    await request(app.getHttpServer()).post('/api/formulations').send({ productId: claimId, ingredients: [{ ingredientId: claimId, percentage: 150 }] }).expect(400);
    formulations.compare.mockResolvedValue({ added: [] });
    await request(app.getHttpServer()).get(`/api/formulations/compare?from=${claimId}&to=${claimId}`).expect(200);
    expect(formulations.get).not.toHaveBeenCalled();
  });

  it('returns the shared error shape for unexpected failures without leaking internals', async () => {
    assessments.get.mockRejectedValue(new Error('SELECT secret FROM ...'));
    const res = await request(app.getHttpServer()).get(`/api/assessments/${claimId}`).expect(500);
    expect(res.body).toMatchObject({ statusCode: 500, error: 'Internal Server Error', message: 'Unexpected server error.' });
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
});

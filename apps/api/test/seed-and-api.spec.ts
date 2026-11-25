import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { readFileSync } from 'fs';
import { join } from 'path';
import request from 'supertest';
import { ApiExceptionFilter } from '../src/common/api-exception.filter';
import { AssessmentsController, AssessmentsService, ClaimAssessmentController } from '../src/modules/assessments/assessments.module';
import { ClaimsController, ClaimsService } from '../src/modules/claims/claims.module';
import { ProductsController, ProductsService } from '../src/modules/products/products.module';
import { seedIfEmpty, validateReferenceData } from '../../../prisma/seed';

const referenceData = JSON.parse(readFileSync(join(__dirname, '../../../prisma/seed-data/reference-data.json'), 'utf8'));

describe('reference dataset and seeding', () => {
  it('is a valid dataset with at least 10 ingredients and real, traceable evidence', () => {
    expect(() => validateReferenceData(referenceData)).not.toThrow();
    expect(referenceData.ingredients.length).toBeGreaterThanOrEqual(15);
    expect(referenceData.evidence.length).toBeGreaterThanOrEqual(25);
  });

  it('contains only verified, source-backed evidence (no sample or fictitious records)', () => {
    for (const e of referenceData.evidence) {
      expect(e.status).toBe('VERIFIED');
      expect(e.doi || e.pmid).toBeTruthy();
      expect(e.title).not.toMatch(/demo|mock|sample/i);
    }
  });

  it('has evidence behind every verified ingredient, and benefit tags on every study', () => {
    const withEvidence = new Set(referenceData.evidence.flatMap((e: any) => e.ingredientKeys));
    for (const ing of referenceData.ingredients) expect(ing.status === 'VERIFIED' ? withEvidence.has(ing.key) : true).toBe(true);
    for (const e of referenceData.evidence) expect(e.benefits.length).toBeGreaterThan(0);
    const niacinamide = referenceData.evidence.filter((e: any) => e.ingredientKeys.includes('niacinamide')).flatMap((e: any) => e.benefits);
    expect(niacinamide).toEqual(expect.arrayContaining(['acne-blemishes', 'oil-control', 'pores', 'anti-wrinkle', 'anti-pigmentation']));
  });

  it('rejects evidence that cannot be traced to a source or references a missing ingredient', () => {
    const untraceable = JSON.parse(JSON.stringify(referenceData));
    untraceable.evidence[0].doi = null; untraceable.evidence[0].pmid = null; untraceable.evidence[0].sourceUrl = null;
    expect(() => validateReferenceData(untraceable)).toThrow(/needs a DOI, PMID or source URL/);
    const dangling = JSON.parse(JSON.stringify(referenceData));
    dangling.evidence[0].ingredientKeys = ['nope'];
    expect(() => validateReferenceData(dangling)).toThrow(/unknown ingredient/);
  });

  const clientWithCounts = (counts: { ingredient: number; evidence: number }) =>
    ({
      ingredient: { count: jest.fn().mockResolvedValue(counts.ingredient) },
      evidence: { count: jest.fn().mockResolvedValue(counts.evidence) },
      $transaction: jest.fn().mockResolvedValue(undefined),
    }) as any;

  it('is idempotent: a non-empty database is left completely untouched', async () => {
    const prisma = clientWithCounts({ ingredient: 3, evidence: 0 });
    expect(await seedIfEmpty(prisma, referenceData, () => undefined)).toBe(false);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('seeds an empty database in a single transaction', async () => {
    const prisma = clientWithCounts({ ingredient: 0, evidence: 0 });
    expect(await seedIfEmpty(prisma, referenceData, () => undefined)).toBe(true);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

describe('HTTP API (services mocked)', () => {
  let app: INestApplication;
  const assessments = { assess: jest.fn(), get: jest.fn(), list: jest.fn(), meta: jest.fn(), forClaim: jest.fn() };
  const claims = { list: jest.fn(), get: jest.fn(), create: jest.fn() };
  const products = { list: jest.fn(), get: jest.fn(), create: jest.fn() };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ClaimAssessmentController, AssessmentsController, ClaimsController, ProductsController],
      providers: [{ provide: AssessmentsService, useValue: assessments }, { provide: ClaimsService, useValue: claims }, { provide: ProductsService, useValue: products }],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    app.useGlobalFilters(new ApiExceptionFilter());
    await app.init();
  });
  afterAll(() => app.close());
  beforeEach(() => jest.clearAllMocks());

  const id = '3f0c1f5e-2b1a-4c3d-9e8f-1a2b3c4d5e6f';

  it('POST /api/claims/assess passes only the claim id to the service and returns its result', async () => {
    assessments.assess.mockResolvedValue({ id: 'a1', verdict: 'INCONCLUSIVE', evidenceScore: 40 });
    const res = await request(app.getHttpServer()).post('/api/claims/assess').send({ claimId: id }).expect(201);
    expect(res.body).toMatchObject({ id: 'a1', verdict: 'INCONCLUSIVE' });
    expect(assessments.assess).toHaveBeenCalledWith({ claimId: id });
  });

  it('POST /api/claims/assess rejects invalid input and client-supplied evidence with a consistent error body', async () => {
    const bad = await request(app.getHttpServer()).post('/api/claims/assess').send({ claimId: 'not-a-uuid' }).expect(400);
    expect(bad.body).toMatchObject({ statusCode: 400, message: 'Validation failed', path: '/api/claims/assess' });
    expect(bad.body.details.length).toBeGreaterThan(0);
    await request(app.getHttpServer()).post('/api/claims/assess').send({ claimId: id, evidence: [{ id: 'fake' }] }).expect(400); // client may not supply evidence
    expect(assessments.assess).not.toHaveBeenCalled();
  });

  it('POST /api/claims validates the claim fields', async () => {
    await request(app.getHttpServer()).post('/api/claims').send({ productId: id, title: 'x', benefits: 'not-an-array', targetValue: -1, durationWeeks: 0 }).expect(400);
    claims.create.mockResolvedValue({ id: 'c1' });
    const ok = { productId: id, title: 'Reduces wrinkle depth by 20% in 4 weeks', benefits: ['anti-wrinkle', 'my own benefit'], targetValue: 20, durationWeeks: 4, targetPopulation: 'Adults' };
    await request(app.getHttpServer()).post('/api/claims').send(ok).expect(201);
    // Only title and product are required; blank strings count as missing.
    await request(app.getHttpServer()).post('/api/claims').send({ productId: id, title: 'Makes skin look calmer and fresher', description: '', targetValue: '', durationWeeks: '' }).expect(201);
    expect(claims.create).toHaveBeenCalledWith(expect.objectContaining({ title: ok.title, durationWeeks: 4 }));
  });

  it('POST /api/products validates the name and percentage ranges', async () => {
    await request(app.getHttpServer()).post('/api/products').send({ name: 'Serum', ingredients: [{ ingredientId: id, percentage: 150 }] }).expect(400);
    await request(app.getHttpServer()).post('/api/products').send({ name: 'Serum', ingredients: [] }).expect(400);
    products.create.mockResolvedValue({ id: 'p1' });
    await request(app.getHttpServer()).post('/api/products').send({ name: 'Serum', ingredients: [{ ingredientId: id, percentage: 100 }] }).expect(201);
  });

  it('GET /api/assessments/meta is routed before /:id and shows no review/persona concepts', async () => {
    assessments.meta.mockReturnValue({ model: 'sonnet' });
    const res = await request(app.getHttpServer()).get('/api/assessments/meta').expect(200);
    expect(res.body.model).toBe('sonnet');
    expect(assessments.get).not.toHaveBeenCalled();
    await request(app.getHttpServer()).patch(`/api/assessments/${id}/review`).send({ decision: 'APPROVED' }).expect(404); // no review stage
  });

  it('returns the shared error shape for unexpected failures without leaking internals', async () => {
    assessments.get.mockRejectedValue(new Error('SELECT secret FROM ...'));
    const res = await request(app.getHttpServer()).get(`/api/assessments/${id}`).expect(500);
    expect(res.body).toMatchObject({ statusCode: 500, error: 'Internal Server Error', message: 'Unexpected server error.' });
    expect(JSON.stringify(res.body)).not.toMatch(/secret/);
  });
});

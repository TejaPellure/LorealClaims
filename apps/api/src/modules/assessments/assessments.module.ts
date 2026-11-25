import { BadRequestException, Body, Controller, Get, Inject, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { ClaimStatus, Prisma, ReviewDecision, Verdict } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';
import { APP_CONFIG, AppConfig } from '../../common/config';
import { pageArgs, paged, PaginationQueryDto, Persona } from '../../common/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssessmentPipeline } from './engine/assessment-pipeline';
import { PROMPT_VERSION } from './engine/prompt';
import { AssessmentProvider, ClaudeProvider, MockProvider, MOCK_MODEL } from './engine/providers/providers';
import { RUBRIC_VERSION } from './engine/scoring';

// ───────────────────────────── DTOs ─────────────────────────────

/** POST /api/claims/assess - only the claim id is trusted input; evidence and formulation come from the database. */
export class AssessClaimDto {
  @IsUUID() claimId: string;
  @IsOptional() @IsBoolean() forceNew?: boolean;
}

export class ReviewAssessmentDto {
  @IsEnum(ReviewDecision) decision: ReviewDecision;
  @IsOptional() @IsString() @MaxLength(4000) comments?: string;
}

export class AssessmentQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(Verdict) verdict?: Verdict;
  @IsOptional() @IsEnum(ReviewDecision) reviewDecision?: ReviewDecision;
}

// ───────────────────────────── Service ─────────────────────────────

export const ASSESSMENT_PIPELINE = 'ASSESSMENT_PIPELINE';

/** Chooses the provider from ASSESSMENT_PROVIDER. Default is the mock so the app runs with no API key. */
export function createProvider(config: AppConfig): AssessmentProvider {
  return config.assessment.provider === 'claude' ? new ClaudeProvider(config.claude) : new MockProvider(config.assessment.supportedMinScore);
}

const detailInclude = {
  claim: { include: { product: { select: { id: true, name: true } } } },
  formulation: { select: { id: true, version: true, basis: true, product: { select: { id: true, name: true } } } },
  evidence: { include: { evidence: { select: { id: true, title: true, scope: true, status: true, doi: true, pmid: true, sourceUrl: true, documents: { select: { id: true } } } } } },
} satisfies Prisma.AssessmentInclude;

const summarySelect = {
  id: true, createdAt: true, verdict: true, evidenceScore: true, provider: true, model: true, reviewDecision: true, reviewedBy: true, reviewedAt: true,
  claim: { select: { id: true, title: true, status: true, product: { select: { id: true, name: true } } } },
  formulation: { select: { id: true, version: true } },
} satisfies Prisma.AssessmentSelect;

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ASSESSMENT_PIPELINE) private readonly pipeline: AssessmentPipeline,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** The challenge endpoint: assess a claim, persist the result, return the saved assessment. */
  async assess(dto: AssessClaimDto, createdBy: string) {
    const { id, reused } = await this.pipeline.run(dto.claimId, { forceNew: dto.forceNew }, createdBy);
    return { ...(await this.get(id)), reused };
  }

  meta() {
    const { assessment, claude } = this.config;
    return {
      provider: assessment.provider.toUpperCase(),
      isMock: assessment.provider === 'mock',
      model: assessment.provider === 'mock' ? MOCK_MODEL : claude.model,
      promptVersion: PROMPT_VERSION,
      rubricVersion: RUBRIC_VERSION,
      weights: assessment.weights,
      supportedMinScore: assessment.supportedMinScore,
    };
  }

  async list(query: AssessmentQueryDto) {
    const where: Prisma.AssessmentWhereInput = {
      verdict: query.verdict,
      reviewDecision: query.reviewDecision,
      ...(query.q && { OR: [{ claim: { title: { contains: query.q, mode: 'insensitive' } } }, { claim: { product: { name: { contains: query.q, mode: 'insensitive' } } } }] }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.assessment.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(query), select: summarySelect }),
      this.prisma.assessment.count({ where }),
    ]);
    return paged(items, total, query);
  }

  async get(id: string) {
    const assessment = await this.prisma.assessment.findUnique({ where: { id }, include: detailInclude });
    if (!assessment) throw new NotFoundException('Assessment not found');
    return assessment;
  }

  async forClaim(claimId: string) {
    if (!(await this.prisma.claim.findUnique({ where: { id: claimId }, select: { id: true } }))) throw new NotFoundException('Claim not found');
    return this.prisma.assessment.findMany({ where: { claimId }, orderBy: { createdAt: 'desc' }, select: summarySelect });
  }

  /** Human decision, stored separately from the AI verdict. The AI never approves a claim. */
  async review(id: string, dto: ReviewAssessmentDto, reviewer: string) {
    const assessment = await this.get(id);
    const decision = dto.decision;
    if (decision === 'PENDING') throw new BadRequestException('Choose approve, reject or request more evidence.');
    if (dto.decision !== 'APPROVED' && !dto.comments?.trim()) throw new BadRequestException('Evaluator comments are required when rejecting or requesting more evidence.');

    const claimStatus: Record<Exclude<ReviewDecision, 'PENDING'>, ClaimStatus> = { APPROVED: 'APPROVED_BY_EVALUATOR', REJECTED: 'REJECTED', MORE_EVIDENCE_REQUESTED: 'REQUIRES_MORE_EVIDENCE' };
    await this.prisma.$transaction(async (tx) => {
      await tx.assessment.update({ where: { id }, data: { reviewDecision: dto.decision, reviewComments: dto.comments, reviewedBy: reviewer, reviewedAt: new Date() } });
      // Only the most recent assessment of a claim moves the claim's workflow status.
      const latest = await tx.assessment.findFirst({ where: { claimId: assessment.claimId }, orderBy: { createdAt: 'desc' }, select: { id: true } });
      if (latest?.id === id) await tx.claim.update({ where: { id: assessment.claimId }, data: { status: claimStatus[decision] } });
    });
    return this.get(id);
  }
}

// ───────────────────────────── Controllers ─────────────────────────────

@Controller('claims')
export class ClaimAssessmentController {
  constructor(private readonly service: AssessmentsService) {}

  @Post('assess') assess(@Body() dto: AssessClaimDto, @Persona() persona: string) { return this.service.assess(dto, persona); }
  @Get(':id/assessments') forClaim(@Param('id', ParseUUIDPipe) id: string) { return this.service.forClaim(id); }
}

@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly service: AssessmentsService) {}

  @Get() list(@Query() query: AssessmentQueryDto) { return this.service.list(query); }
  @Get('meta') meta() { return this.service.meta(); } // before ":id"
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.service.get(id); }
  @Patch(':id/review') review(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ReviewAssessmentDto, @Persona() persona: string) { return this.service.review(id, dto, persona); }
}

@Module({
  controllers: [ClaimAssessmentController, AssessmentsController],
  providers: [
    AssessmentsService,
    {
      provide: ASSESSMENT_PIPELINE,
      inject: [PrismaService, APP_CONFIG],
      useFactory: (prisma: PrismaService, config: AppConfig) => new AssessmentPipeline(prisma, createProvider(config), config.assessment),
    },
  ],
})
export class AssessmentsModule {}

import { Body, Controller, Get, Inject, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Prisma, Verdict } from '@prisma/client';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { APP_CONFIG, AppConfig } from '../../common/config';
import { pageArgs, paged, PaginationQueryDto } from '../../common/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AssessmentPipeline } from './engine/assessment-pipeline';
import { PROMPT_VERSION } from './engine/prompt';
import { ClaudeProvider } from './engine/providers/providers';

// ───────────────────────────── DTOs ─────────────────────────────

/** POST /api/claims/assess: only the claim id is trusted input; evidence and formulation come from the database. */
export class AssessClaimDto {
  @IsUUID() claimId: string;
  @IsOptional() @IsBoolean() forceNew?: boolean;
}

export class AssessmentQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(Verdict) verdict?: Verdict;
}

// ───────────────────────────── Service ─────────────────────────────

export const ASSESSMENT_PIPELINE = 'ASSESSMENT_PIPELINE';

const detailInclude = {
  claim: { include: { product: { select: { id: true, name: true } } } },
  formulation: { select: { id: true, product: { select: { id: true, name: true } } } },
  evidence: { include: { evidence: { select: { id: true, title: true, scope: true, status: true, doi: true, pmid: true, sourceUrl: true, documents: { select: { id: true } } } } } },
} satisfies Prisma.AssessmentInclude;

const summarySelect = {
  id: true, createdAt: true, verdict: true, evidenceScore: true, model: true,
  claim: { select: { id: true, title: true, product: { select: { id: true, name: true } } } },
} satisfies Prisma.AssessmentSelect;

@Injectable()
export class AssessmentsService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ASSESSMENT_PIPELINE) private readonly pipeline: AssessmentPipeline,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** The challenge endpoint: assess a claim with Claude, persist the result, return the saved assessment. */
  async assess(dto: AssessClaimDto) {
    const { id, reused } = await this.pipeline.run(dto.claimId, { forceNew: dto.forceNew });
    return { ...(await this.get(id)), reused };
  }

  meta() {
    return { model: this.config.claude.model, promptVersion: PROMPT_VERSION };
  }

  async list(query: AssessmentQueryDto) {
    const where: Prisma.AssessmentWhereInput = {
      verdict: query.verdict,
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
}

// ───────────────────────────── Controllers ─────────────────────────────

@Controller('claims')
export class ClaimAssessmentController {
  constructor(private readonly service: AssessmentsService) {}

  @Post('assess') assess(@Body() dto: AssessClaimDto) { return this.service.assess(dto); }
  @Get(':id/assessments') forClaim(@Param('id', ParseUUIDPipe) id: string) { return this.service.forClaim(id); }
}

@Controller('assessments')
export class AssessmentsController {
  constructor(private readonly service: AssessmentsService) {}

  @Get() list(@Query() query: AssessmentQueryDto) { return this.service.list(query); }
  @Get('meta') meta() { return this.service.meta(); } // before ":id"
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.service.get(id); }
}

@Module({
  controllers: [ClaimAssessmentController, AssessmentsController],
  providers: [
    AssessmentsService,
    {
      provide: ASSESSMENT_PIPELINE,
      inject: [PrismaService, APP_CONFIG],
      useFactory: (prisma: PrismaService, config: AppConfig) => new AssessmentPipeline(prisma, new ClaudeProvider(config.claude)),
    },
  ],
})
export class AssessmentsModule {}

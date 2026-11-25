import {
  BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { BenefitCategory, ClaimStatus, Prisma } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { pageArgs, paged, PaginationQueryDto, Persona } from '../../common/common';
import { PrismaService } from '../../prisma/prisma.service';
import { canTransition, validateClaimReadiness } from './claim-rules';

export class CreateClaimDto {
  @IsUUID() productId: string;
  /** Optional while the claim is only a business proposal; required before it can be assessed. */
  @IsOptional() @IsUUID() formulationId?: string;
  @IsString() @MinLength(5) title: string;
  @IsString() description: string;
  @IsEnum(BenefitCategory) benefitCategory: BenefitCategory;
  @IsString() targetOutcome: string;
  @IsString() measurementEndpoint: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) targetValue: number;
  @IsString() measurementUnit: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(520) durationWeeks: number;
  @IsString() targetPopulation: string;
  @IsOptional() @IsString() applicationFrequency?: string;
  @IsOptional() @IsString() scientificContext?: string;
}
export class UpdateClaimDto extends PartialType(CreateClaimDto) {}

export class ClaimStatusDto {
  @IsEnum(ClaimStatus) status: ClaimStatus;
  @IsOptional() @IsString() managerNotes?: string;
}

export class ClaimQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(ClaimStatus) status?: ClaimStatus;
  @IsOptional() @IsUUID() productId?: string;
}

const claimInclude = {
  product: { select: { id: true, name: true } },
  formulation: { select: { id: true, version: true, status: true } },
  assessments: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { id: true, verdict: true, evidenceScore: true, createdAt: true, reviewDecision: true, provider: true } },
} satisfies Prisma.ClaimInclude;

/** Statuses a reviewer decision may NOT be set through the generic status endpoint. */
const SYSTEM_ONLY_STATUSES: ClaimStatus[] = ['ASSESSED', 'APPROVED_BY_EVALUATOR'];

@Injectable()
export class ClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ClaimQueryDto) {
    const where: Prisma.ClaimWhereInput = {
      status: query.status,
      productId: query.productId,
      ...(query.q && { OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { product: { name: { contains: query.q, mode: 'insensitive' } } }] }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.claim.findMany({ where, orderBy: { updatedAt: 'desc' }, ...pageArgs(query), include: claimInclude }),
      this.prisma.claim.count({ where }),
    ]);
    return paged(items, total, query);
  }

  async get(id: string) {
    const claim = await this.prisma.claim.findUnique({
      where: { id },
      include: { ...claimInclude, formulation: { include: { ingredients: { orderBy: { position: 'asc' }, include: { ingredient: true } } } } },
    });
    if (!claim) throw new NotFoundException('Claim not found');
    return claim;
  }

  async create(dto: CreateClaimDto, createdBy: string) {
    await this.assertFormulationBelongsToProduct(dto.formulationId, dto.productId);
    return this.prisma.claim.create({ data: { ...dto, createdBy }, include: claimInclude });
  }

  async update(id: string, dto: UpdateClaimDto) {
    const existing = await this.get(id);
    await this.assertFormulationBelongsToProduct(dto.formulationId, dto.productId ?? existing.productId);
    // Past assessments keep their own claim snapshot, so editing a claim never rewrites history.
    return this.prisma.claim.update({ where: { id }, data: dto, include: claimInclude });
  }

  async setStatus(id: string, dto: ClaimStatusDto) {
    const claim = await this.get(id);
    if (SYSTEM_ONLY_STATUSES.includes(dto.status)) {
      throw new BadRequestException(`${dto.status} is set by running or reviewing an assessment, not manually.`);
    }
    if (!canTransition(claim.status, dto.status)) {
      throw new BadRequestException(`Cannot move a claim from ${claim.status} to ${dto.status}.`);
    }
    if (dto.status === 'READY_FOR_ASSESSMENT') {
      const problems = validateClaimReadiness(claim, claim.formulation && {
        ingredients: claim.formulation.ingredients.map((l) => ({ ingredientId: l.ingredientId, percentage: l.percentage.toNumber(), ingredientName: l.ingredient.name })),
      });
      if (problems.length) throw new BadRequestException({ message: 'Claim is not ready for assessment.', details: problems });
    }
    return this.prisma.$transaction(async (tx) => {
      // Submitting for assessment locks the formulation version the claim points at.
      if (dto.status === 'READY_FOR_ASSESSMENT' && claim.formulationId) {
        await tx.formulation.update({ where: { id: claim.formulationId }, data: { status: 'FINAL' } });
      }
      return tx.claim.update({ where: { id }, data: { status: dto.status, managerNotes: dto.managerNotes }, include: claimInclude });
    });
  }

  private async assertFormulationBelongsToProduct(formulationId: string | undefined, productId: string) {
    if (!formulationId) return;
    const formulation = await this.prisma.formulation.findUnique({ where: { id: formulationId } });
    if (!formulation || formulation.productId !== productId) {
      throw new BadRequestException('The formulation does not exist or belongs to a different product.');
    }
  }
}

@Controller('claims')
export class ClaimsController {
  constructor(private readonly service: ClaimsService) {}

  @Get() list(@Query() query: ClaimQueryDto) { return this.service.list(query); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateClaimDto, @Persona() persona: string) { return this.service.create(dto, persona); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateClaimDto) { return this.service.update(id, dto); }
  @Patch(':id/status') setStatus(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ClaimStatusDto) { return this.service.setStatus(id, dto); }
}

@Module({ controllers: [ClaimsController], providers: [ClaimsService], exports: [ClaimsService] })
export class ClaimsModule {}

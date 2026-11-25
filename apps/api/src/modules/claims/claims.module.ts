import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { pageArgs, paged, PaginationQueryDto } from '../../common/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeBenefit } from '../../common/benefits';

/** Empty strings from the UI count as "not provided". */
const blankToUndefined = ({ value }: { value: unknown }) => (value === '' || value === null ? undefined : value);
/** Blank -> undefined, otherwise a number (done in one step: a separate @Type would turn '' into 0 first). */
const optionalNumber = ({ value }: { value: unknown }) => (value === '' || value === null || value === undefined ? undefined : Number(value));

/**
 * Only the wording is required. Description, benefit chips, improvement, timeframe and population are optional:
 * Claude reads whatever the user provides, from the form fields and from the free text.
 */
export class CreateClaimDto {
  @IsUUID() productId: string;
  @IsString() @MinLength(5) @MaxLength(300) title: string;
  @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(2000) description?: string;
  /** Preset chips or any custom benefit the user typed. */
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) @MaxLength(40, { each: true }) benefits?: string[];
  @Transform(optionalNumber) @IsOptional() @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) targetValue?: number;
  @Transform(optionalNumber) @IsOptional() @IsInt() @Min(1) @Max(520) durationWeeks?: number;
  @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(200) targetPopulation?: string;
  @Transform(blankToUndefined) @IsOptional() @IsString() @MaxLength(20) measurementUnit?: string;
}

export class ClaimQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsUUID() productId?: string;
}

const claimInclude = {
  product: { select: { id: true, name: true } },
  assessments: { orderBy: { createdAt: 'desc' as const }, take: 1, select: { id: true, verdict: true, evidenceScore: true, createdAt: true } },
  _count: { select: { assessments: true } },
} satisfies Prisma.ClaimInclude;

@Injectable()
export class ClaimsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ClaimQueryDto) {
    const where: Prisma.ClaimWhereInput = {
      productId: query.productId,
      ...(query.q && { OR: [{ title: { contains: query.q, mode: 'insensitive' } }, { product: { name: { contains: query.q, mode: 'insensitive' } } }] }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.claim.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(query), include: claimInclude }),
      this.prisma.claim.count({ where }),
    ]);
    return paged(items, total, query);
  }

  async get(id: string) {
    const claim = await this.prisma.claim.findUnique({ where: { id }, include: claimInclude });
    if (!claim) throw new NotFoundException('Claim not found');
    return claim;
  }

  async create(dto: CreateClaimDto) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId }, include: { formulations: { orderBy: { createdAt: 'desc' }, take: 1 } } });
    if (!product) throw new BadRequestException('The product does not exist.');
    const formulation = product.formulations[0];
    if (!formulation) throw new BadRequestException('The product has no formulation yet.');

    return this.prisma.claim.create({
      data: {
        productId: product.id,
        formulationId: formulation.id,
        title: dto.title.trim(),
        description: dto.description?.trim() || null,
        benefits: [...new Set((dto.benefits ?? []).map(normalizeBenefit).filter(Boolean))],
        targetValue: dto.targetValue ?? null,
        measurementUnit: dto.measurementUnit?.trim() || '%',
        durationWeeks: dto.durationWeeks ?? null,
        targetPopulation: dto.targetPopulation?.trim() || null,
      },
      include: claimInclude,
    });
  }
}

@Controller('claims')
export class ClaimsController {
  constructor(private readonly service: ClaimsService) {}

  @Get() list(@Query() query: ClaimQueryDto) { return this.service.list(query); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateClaimDto) { return this.service.create(dto); }
}

@Module({ controllers: [ClaimsController], providers: [ClaimsService], exports: [ClaimsService] })
export class ClaimsModule {}

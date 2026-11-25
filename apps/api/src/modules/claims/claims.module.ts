import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { BenefitCategory, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { pageArgs, paged, PaginationQueryDto } from '../../common/common';
import { PrismaService } from '../../prisma/prisma.service';

/** What each benefit category is measured by. Derived on the server so the user types less. */
const ENDPOINT_BY_CATEGORY: Record<BenefitCategory, string> = {
  HYDRATION: 'Skin hydration (corneometry)',
  ANTI_WRINKLE: 'Wrinkle depth / fine lines',
  BARRIER_REPAIR: 'Skin barrier function (transepidermal water loss)',
  BRIGHTENING: 'Skin tone and pigmentation',
  SOOTHING: 'Skin redness and comfort',
  OTHER: 'As described in the claim wording',
};

/** The few things needed to assess a claim. The formulation is the product's own formulation. */
export class CreateClaimDto {
  @IsUUID() productId: string;
  @IsString() @MinLength(5) @MaxLength(300) title: string;
  @IsEnum(BenefitCategory) benefitCategory: BenefitCategory;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) targetValue: number;
  @Type(() => Number) @IsInt() @Min(1) @Max(520) durationWeeks: number;
  @IsString() @MinLength(2) @MaxLength(200) targetPopulation: string;
  @IsOptional() @IsString() @MaxLength(20) measurementUnit?: string;
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
        benefitCategory: dto.benefitCategory,
        measurementEndpoint: ENDPOINT_BY_CATEGORY[dto.benefitCategory],
        targetValue: dto.targetValue,
        measurementUnit: dto.measurementUnit?.trim() || '%',
        durationWeeks: dto.durationWeeks,
        targetPopulation: dto.targetPopulation.trim(),
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

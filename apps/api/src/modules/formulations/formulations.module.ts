import {
  BadRequestException, Body, ConflictException, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query,
} from '@nestjs/common';
import { FormulaBasis, FormulationStatus, Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsNumber, IsOptional, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';
import { Persona } from '../../common/common';
import { PrismaService } from '../../prisma/prisma.service';
import { checkComposition, CompositionLine } from './composition';

// ───────────────────────────── DTOs ─────────────────────────────

export class FormulationLineDto {
  @IsUUID() ingredientId: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(100) percentage: number;
}

class FormulationBodyDto {
  @IsOptional() @IsString() notes?: string;
  @IsOptional() @IsEnum(FormulaBasis) basis?: FormulaBasis;
  @IsOptional() @IsString() basisNote?: string;
  /** DRAFT may be incomplete; FINAL must total exactly 100% and then becomes immutable. */
  @IsOptional() @IsEnum(FormulationStatus) status?: FormulationStatus;
}

export class CreateFormulationDto extends FormulationBodyDto {
  @IsUUID() productId: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => FormulationLineDto) ingredients: FormulationLineDto[];
}

export class CreateVersionDto extends FormulationBodyDto {
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => FormulationLineDto) ingredients: FormulationLineDto[];
}

export class UpdateFormulationDto extends FormulationBodyDto {
  @IsOptional() @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => FormulationLineDto) ingredients?: FormulationLineDto[];
}

// ───────────────────────────── Service ─────────────────────────────

const formulationInclude = {
  product: { select: { id: true, name: true } },
  ingredients: { orderBy: { position: 'asc' as const }, include: { ingredient: true } },
} satisfies Prisma.FormulationInclude;

@Injectable()
export class FormulationsService {
  constructor(private readonly prisma: PrismaService) {}

  /** Composition check for stored lines, including reference-range warnings from ingredient metadata. */
  private async check(lines: FormulationLineDto[]) {
    const ingredients = await this.prisma.ingredient.findMany({ where: { id: { in: lines.map((l) => l.ingredientId) } } });
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    const missing = lines.filter((l) => !byId.has(l.ingredientId));
    if (missing.length) throw new BadRequestException('One or more ingredients do not exist.');
    const compositionLines: CompositionLine[] = lines.map((l) => {
      const ing = byId.get(l.ingredientId)!;
      return {
        ingredientId: l.ingredientId, percentage: l.percentage, ingredientName: ing.name,
        minConcentration: ing.minConcentration?.toNumber() ?? null, maxConcentration: ing.maxConcentration?.toNumber() ?? null,
      };
    });
    return checkComposition(compositionLines);
  }

  /** Saving as FINAL is blocked unless the composition is exactly 100% (within tolerance). */
  private async assertSavable(lines: FormulationLineDto[], status: FormulationStatus) {
    const check = await this.check(lines);
    const duplicates = check.errors.filter((e) => e.includes('more than once'));
    if (duplicates.length) throw new BadRequestException({ message: 'Invalid formulation', details: duplicates });
    if (status === 'FINAL' && check.errors.length) throw new BadRequestException({ message: 'A final formulation must total exactly 100%.', details: check.errors });
    if (check.status === 'OVER') throw new BadRequestException({ message: 'Total concentration exceeds 100%.', details: check.errors });
  }

  private lineData(lines: FormulationLineDto[]) {
    return lines.map((l, position) => ({ ingredientId: l.ingredientId, percentage: l.percentage, position }));
  }

  async get(id: string) {
    const formulation = await this.prisma.formulation.findUnique({
      where: { id },
      include: { ...formulationInclude, claims: { select: { id: true, title: true, status: true } }, _count: { select: { evidence: true } } },
    });
    if (!formulation) throw new NotFoundException('Formulation not found');
    const composition = checkComposition(
      formulation.ingredients.map((l) => ({
        ingredientId: l.ingredientId, percentage: l.percentage.toNumber(), ingredientName: l.ingredient.name,
        minConcentration: l.ingredient.minConcentration?.toNumber() ?? null, maxConcentration: l.ingredient.maxConcentration?.toNumber() ?? null,
      })),
    );
    return { ...formulation, composition };
  }

  listForProduct(productId: string) {
    return this.prisma.formulation.findMany({
      where: { productId },
      orderBy: { version: 'desc' },
      include: { ...formulationInclude, _count: { select: { claims: true, evidence: true } } },
    });
  }

  async create(dto: CreateFormulationDto, createdBy: string) {
    const product = await this.prisma.product.findUnique({ where: { id: dto.productId } });
    if (!product) throw new NotFoundException('Product not found');
    return this.createNextVersion(dto.productId, dto, createdBy);
  }

  /** New version of the same product, copying nothing implicitly: the caller sends the full ingredient list. */
  async createVersion(fromId: string, dto: CreateVersionDto, createdBy: string) {
    const source = await this.prisma.formulation.findUnique({ where: { id: fromId } });
    if (!source) throw new NotFoundException('Formulation not found');
    return this.createNextVersion(source.productId, { ...dto, basis: dto.basis ?? source.basis, basisNote: dto.basisNote ?? source.basisNote ?? undefined }, createdBy);
  }

  private async createNextVersion(productId: string, dto: CreateVersionDto, createdBy: string) {
    const status = dto.status ?? 'DRAFT';
    await this.assertSavable(dto.ingredients, status);
    // Retry once if two users create a version at the same moment (unique [productId, version]).
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const last = await this.prisma.formulation.aggregate({ where: { productId }, _max: { version: true } });
        const created = await this.prisma.formulation.create({
          data: {
            productId, version: (last._max.version ?? 0) + 1, status, createdBy,
            notes: dto.notes, basis: dto.basis, basisNote: dto.basisNote,
            ingredients: { create: this.lineData(dto.ingredients) },
          },
        });
        return this.get(created.id);
      } catch (error) {
        const isRace = error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002';
        if (!isRace || attempt === 1) throw error;
      }
    }
  }

  async update(id: string, dto: UpdateFormulationDto) {
    const existing = await this.prisma.formulation.findUnique({ where: { id }, include: { ingredients: true } });
    if (!existing) throw new NotFoundException('Formulation not found');
    if (existing.status === 'FINAL') {
      // Immutability: claims and assessments reference this exact version.
      throw new ConflictException('This formulation version is final. Save a new version instead.');
    }
    const lines = dto.ingredients ?? existing.ingredients.map((l) => ({ ingredientId: l.ingredientId, percentage: l.percentage.toNumber() }));
    await this.assertSavable(lines, dto.status ?? 'DRAFT');
    await this.prisma.formulation.update({
      where: { id },
      data: {
        notes: dto.notes, basis: dto.basis, basisNote: dto.basisNote, status: dto.status,
        ...(dto.ingredients && { ingredients: { deleteMany: {}, create: this.lineData(dto.ingredients) } }),
      },
    });
    return this.get(id);
  }

  /** Side-by-side comparison of two versions: ingredient diff, evidence diff and latest assessments. */
  async compare(fromId: string, toId: string) {
    const [from, to] = await Promise.all([this.get(fromId), this.get(toId)]);
    const fromMap = new Map(from.ingredients.map((l) => [l.ingredientId, l]));
    const toMap = new Map(to.ingredients.map((l) => [l.ingredientId, l]));

    const added = to.ingredients.filter((l) => !fromMap.has(l.ingredientId)).map((l) => ({ ingredient: l.ingredient.name, percentage: l.percentage.toNumber() }));
    const removed = from.ingredients.filter((l) => !toMap.has(l.ingredientId)).map((l) => ({ ingredient: l.ingredient.name, percentage: l.percentage.toNumber() }));
    const changed = to.ingredients
      .filter((l) => fromMap.has(l.ingredientId) && !fromMap.get(l.ingredientId)!.percentage.equals(l.percentage))
      .map((l) => ({ ingredient: l.ingredient.name, from: fromMap.get(l.ingredientId)!.percentage.toNumber(), to: l.percentage.toNumber() }));

    const [fromEvidence, toEvidence] = await Promise.all([this.evidenceFor(from.id), this.evidenceFor(to.id)]);
    const fromIds = new Set(fromEvidence.map((e) => e.id));
    const toIds = new Set(toEvidence.map((e) => e.id));

    const [previousAssessment, latestAssessment] = await Promise.all([this.latestAssessment(from.id), this.latestAssessment(to.id)]);
    return {
      from: { id: from.id, version: from.version, product: from.product, composition: from.composition },
      to: { id: to.id, version: to.version, product: to.product, composition: to.composition },
      added, removed, changed,
      evidence: {
        gained: toEvidence.filter((e) => !fromIds.has(e.id)),
        lost: fromEvidence.filter((e) => !toIds.has(e.id)),
        unchangedCount: toEvidence.filter((e) => fromIds.has(e.id)).length,
      },
      previousAssessment,
      latestAssessment,
    };
  }

  /** All evidence reachable from a formulation: via its ingredients or directly linked finished-product studies. */
  private evidenceFor(formulationId: string) {
    return this.prisma.evidence.findMany({
      where: {
        OR: [
          { formulationLinks: { some: { formulationId } } },
          { ingredientLinks: { some: { ingredient: { formulationItems: { some: { formulationId } } } } } },
        ],
      },
      select: { id: true, title: true, scope: true, status: true },
      orderBy: { title: 'asc' },
    });
  }

  private latestAssessment(formulationId: string) {
    return this.prisma.assessment.findFirst({
      where: { formulationId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, verdict: true, evidenceScore: true, createdAt: true, claim: { select: { id: true, title: true } } },
    });
  }
}

// ───────────────────────────── Controller ─────────────────────────────

@Controller()
export class FormulationsController {
  constructor(private readonly service: FormulationsService) {}

  @Get('products/:id/formulations') forProduct(@Param('id', ParseUUIDPipe) id: string) { return this.service.listForProduct(id); }
  // Declared before ":id" so "compare" is not parsed as an id.
  @Get('formulations/compare') compare(@Query('from', ParseUUIDPipe) from: string, @Query('to', ParseUUIDPipe) to: string) { return this.service.compare(from, to); }
  @Get('formulations/:id') get(@Param('id', ParseUUIDPipe) id: string) { return this.service.get(id); }
  @Post('formulations') create(@Body() dto: CreateFormulationDto, @Persona() persona: string) { return this.service.create(dto, persona); }
  @Post('formulations/:id/versions') version(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CreateVersionDto, @Persona() persona: string) { return this.service.createVersion(id, dto, persona); }
  @Patch('formulations/:id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateFormulationDto) { return this.service.update(id, dto); }
}

@Module({ controllers: [FormulationsController], providers: [FormulationsService], exports: [FormulationsService] })
export class FormulationsModule {}

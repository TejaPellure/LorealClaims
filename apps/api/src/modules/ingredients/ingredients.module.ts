import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { IngredientCategory, Prisma, VerificationStatus } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsArray, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { pageArgs, paged, PaginationQueryDto } from '../../common/common';
import { PrismaService } from '../../prisma/prisma.service';

class SourceDto {
  @IsString() name: string;
  @IsOptional() @IsString() url?: string;
}

export class CreateIngredientDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsString() @MinLength(2) @MaxLength(160) inciName: string;
  @IsOptional() @IsString() chemicalName?: string;
  @IsString() @MinLength(5) description: string;
  @IsEnum(IngredientCategory) category: IngredientCategory;
  @IsString() primaryFunction: string;
  @IsOptional() @IsArray() @IsString({ each: true }) commonApplications?: string[];
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) minConcentration?: number;
  @IsOptional() @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) maxConcentration?: number;
  @IsOptional() @IsString() concentrationSource?: string;
  @IsOptional() @IsString() solubility?: string;
  @IsOptional() @IsString() compatibilityNotes?: string;
  @IsOptional() @IsString() regulatoryNotes?: string;
  @IsOptional() @IsArray() @ValidateNested({ each: true }) @Type(() => SourceDto) sources?: SourceDto[];
  @IsOptional() @IsEnum(VerificationStatus) status?: VerificationStatus;
}
export class UpdateIngredientDto extends PartialType(CreateIngredientDto) {}

export class IngredientQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(IngredientCategory) category?: IngredientCategory;
  @IsOptional() @IsEnum(VerificationStatus) status?: VerificationStatus;
}

@Injectable()
export class IngredientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: IngredientQueryDto) {
    const where: Prisma.IngredientWhereInput = {
      category: query.category,
      status: query.status,
      ...(query.q && {
        OR: [
          { name: { contains: query.q, mode: 'insensitive' } },
          { inciName: { contains: query.q, mode: 'insensitive' } },
          { primaryFunction: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [rows, total] = await this.prisma.$transaction([
      this.prisma.ingredient.findMany({ where, orderBy: { name: 'asc' }, ...pageArgs(query), include: { _count: { select: { evidenceLinks: true } } } }),
      this.prisma.ingredient.count({ where }),
    ]);
    const items = rows.map(({ _count, ...ingredient }) => ({ ...ingredient, evidenceCount: _count.evidenceLinks }));
    return paged(items, total, query);
  }

  async get(id: string) {
    const ingredient = await this.prisma.ingredient.findUnique({
      where: { id },
      include: { _count: { select: { evidenceLinks: true } } },
    });
    if (!ingredient) throw new NotFoundException('Ingredient not found');
    const { _count, ...rest } = ingredient;
    return { ...rest, evidenceCount: _count.evidenceLinks };
  }

  create(dto: CreateIngredientDto) {
    return this.prisma.ingredient.create({ data: this.toData(dto) as Prisma.IngredientCreateInput });
  }

  async update(id: string, dto: UpdateIngredientDto) {
    await this.get(id);
    return this.prisma.ingredient.update({ where: { id }, data: this.toData(dto) });
  }

  async evidence(id: string) {
    await this.get(id);
    const links = await this.prisma.ingredientEvidence.findMany({
      where: { ingredientId: id },
      include: { evidence: { include: { documents: { select: { id: true } } } } },
      orderBy: { evidence: { publishedAt: 'desc' } },
    });
    return links.map((l) => l.evidence);
  }

  private toData(dto: UpdateIngredientDto) {
    const { sources, ...rest } = dto;
    return { ...rest, ...(sources && { sources: sources as unknown as Prisma.InputJsonValue }) };
  }
}

@Controller('ingredients')
export class IngredientsController {
  constructor(private readonly service: IngredientsService) {}

  @Get() list(@Query() query: IngredientQueryDto) { return this.service.list(query); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.service.get(id); }
  @Get(':id/evidence') evidence(@Param('id', ParseUUIDPipe) id: string) { return this.service.evidence(id); }
  @Post() create(@Body() dto: CreateIngredientDto) { return this.service.create(dto); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateIngredientDto) { return this.service.update(id, dto); }
}

@Module({ controllers: [IngredientsController], providers: [IngredientsService], exports: [IngredientsService] })
export class IngredientsModule {}

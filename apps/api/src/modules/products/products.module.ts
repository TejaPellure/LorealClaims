import { BadRequestException, Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Post, Query } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsNumber, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { pageArgs, paged, PaginationQueryDto } from '../../common/common';
import { PrismaService } from '../../prisma/prisma.service';
import { checkComposition } from './composition';

export class FormulationLineDto {
  @IsUUID() ingredientId: string;
  @IsNumber({ maxDecimalPlaces: 4 }) @Min(0.0001) @Max(100) percentage: number;
}

/** A product is always created together with its formulation, which must total exactly 100%. */
export class CreateProductDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsArray() @ArrayMinSize(1) @ValidateNested({ each: true }) @Type(() => FormulationLineDto) ingredients: FormulationLineDto[];
}

export class ProductQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
}

const productInclude = {
  formulations: {
    orderBy: { createdAt: 'desc' as const },
    include: { ingredients: { orderBy: { position: 'asc' as const }, include: { ingredient: { select: { id: true, name: true, inciName: true, category: true } } } } },
  },
  _count: { select: { claims: true } },
} satisfies Prisma.ProductInclude;

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProductQueryDto) {
    const where = query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({ where, orderBy: { createdAt: 'desc' }, ...pageArgs(query), include: productInclude }),
      this.prisma.product.count({ where }),
    ]);
    return paged(items, total, query);
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({ where: { id }, include: productInclude });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  /** Validates the composition (exactly 100%, known ingredients), then saves product + formulation atomically. */
  async create(dto: CreateProductDto) {
    const ingredients = await this.prisma.ingredient.findMany({ where: { id: { in: dto.ingredients.map((l) => l.ingredientId) } } });
    const byId = new Map(ingredients.map((i) => [i.id, i]));
    if (dto.ingredients.some((l) => !byId.has(l.ingredientId))) throw new BadRequestException('One or more ingredients do not exist.');

    const composition = checkComposition(
      dto.ingredients.map((l) => {
        const ing = byId.get(l.ingredientId)!;
        return { ingredientId: l.ingredientId, percentage: l.percentage, ingredientName: ing.name, minConcentration: ing.minConcentration?.toNumber() ?? null, maxConcentration: ing.maxConcentration?.toNumber() ?? null };
      }),
    );
    if (composition.errors.length) throw new BadRequestException({ message: 'The formulation must total exactly 100%.', details: composition.errors });

    const product = await this.prisma.product.create({
      data: {
        name: dto.name.trim(),
        formulations: { create: { ingredients: { create: dto.ingredients.map((l, position) => ({ ingredientId: l.ingredientId, percentage: l.percentage, position })) } } },
      },
      include: productInclude,
    });
    return { ...product, warnings: composition.warnings };
  }
}

@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get() list(@Query() query: ProductQueryDto) { return this.service.list(query); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateProductDto) { return this.service.create(dto); }
}

@Module({ controllers: [ProductsController], providers: [ProductsService], exports: [ProductsService] })
export class ProductsModule {}

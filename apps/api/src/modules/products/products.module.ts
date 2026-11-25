import { Body, Controller, Get, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post, Query } from '@nestjs/common';
import { PartialType } from '@nestjs/mapped-types';
import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { pageArgs, paged, PaginationQueryDto, Persona } from '../../common/common';
import { PrismaService } from '../../prisma/prisma.service';

export class CreateProductDto {
  @IsString() @MinLength(2) @MaxLength(120) name: string;
  @IsString() @MinLength(3) description: string;
  @IsString() category: string;
}
export class UpdateProductDto extends PartialType(CreateProductDto) {}

export class ProductQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
}

@Injectable()
export class ProductsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(query: ProductQueryDto) {
    const where = query.q ? { name: { contains: query.q, mode: 'insensitive' as const } } : {};
    const [items, total] = await this.prisma.$transaction([
      this.prisma.product.findMany({
        where, orderBy: { createdAt: 'desc' }, ...pageArgs(query),
        include: { _count: { select: { formulations: true, claims: true } }, formulations: { select: { id: true, version: true, status: true, basis: true }, orderBy: { version: 'desc' } } },
      }),
      this.prisma.product.count({ where }),
    ]);
    return paged(items, total, query);
  }

  async get(id: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      include: {
        formulations: { orderBy: { version: 'desc' }, select: { id: true, version: true, status: true, basis: true, createdAt: true } },
        claims: { orderBy: { createdAt: 'desc' }, select: { id: true, title: true, status: true, formulationId: true } },
      },
    });
    if (!product) throw new NotFoundException('Product not found');
    return product;
  }

  create(dto: CreateProductDto, createdBy: string) {
    return this.prisma.product.create({ data: { ...dto, createdBy } });
  }

  async update(id: string, dto: UpdateProductDto) {
    await this.get(id);
    return this.prisma.product.update({ where: { id }, data: dto });
  }
}

@Controller('products')
export class ProductsController {
  constructor(private readonly service: ProductsService) {}

  @Get() list(@Query() query: ProductQueryDto) { return this.service.list(query); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateProductDto, @Persona() persona: string) { return this.service.create(dto, persona); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateProductDto) { return this.service.update(id, dto); }
}

@Module({ controllers: [ProductsController], providers: [ProductsService], exports: [ProductsService] })
export class ProductsModule {}

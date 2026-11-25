import {
  BadRequestException, Body, Controller, Get, Inject, Injectable, Module, NotFoundException, Param, ParseUUIDPipe, Patch, Post,
  Query, Res, UploadedFile, UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { PartialType } from '@nestjs/mapped-types';
import {
  BenefitCategory, EffectDirection, EvidenceScope, EvidenceType, Prisma, QualityRating, VerificationStatus,
} from '@prisma/client';
import { ArrayMinSize, IsArray, IsDateString, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUrl, IsUUID, Max, Min, MinLength } from 'class-validator';
import { Type } from 'class-transformer';
import { randomUUID } from 'crypto';
import type { Response } from 'express';
import { createReadStream, existsSync, mkdirSync } from 'fs';
import { open, unlink } from 'fs/promises';
import { diskStorage } from 'multer';
import { join } from 'path';
import { APP_CONFIG, AppConfig, loadConfig } from '../../common/config';
import { pageArgs, paged, PaginationQueryDto, Persona } from '../../common/common';
import { PrismaService } from '../../prisma/prisma.service';

// ───────────────────────────── DTOs ─────────────────────────────

export class CreateEvidenceDto {
  @IsString() @MinLength(5) title: string;
  @IsEnum(EvidenceType) evidenceType: EvidenceType;
  @IsEnum(EvidenceScope) scope: EvidenceScope;
  @IsArray() @ArrayMinSize(1) @IsEnum(BenefitCategory, { each: true }) benefitCategories: BenefitCategory[];
  @IsString() sourceName: string;
  @IsOptional() @IsString() doi?: string;
  @IsOptional() @IsString() pmid?: string;
  @IsOptional() @IsUrl() sourceUrl?: string;
  @IsOptional() @IsDateString() publishedAt?: string;
  @IsString() studyDesign: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) sampleSize?: number;
  @IsString() population: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(520) durationWeeks?: number;
  @IsString() testedSubject: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 4 }) @Min(0) @Max(100) testedConcentration?: number;
  @IsString() endpoint: string;
  @IsString() methodology: string;
  @IsString() resultsSummary: string;
  @IsEnum(EffectDirection) effectDirection: EffectDirection;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) effectMagnitude?: number;
  @IsString() limitations: string;
  @IsEnum(QualityRating) quality: QualityRating;
  @IsOptional() @IsEnum(VerificationStatus) status?: VerificationStatus;
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) ingredientIds?: string[];
  @IsOptional() @IsArray() @IsUUID('all', { each: true }) formulationIds?: string[];
}
export class UpdateEvidenceDto extends PartialType(CreateEvidenceDto) {}

export class EvidenceQueryDto extends PaginationQueryDto {
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsEnum(EvidenceType) evidenceType?: EvidenceType;
  @IsOptional() @IsEnum(EvidenceScope) scope?: EvidenceScope;
  @IsOptional() @IsEnum(VerificationStatus) status?: VerificationStatus;
  @IsOptional() @IsUUID() ingredientId?: string;
}

// ───────────────────────────── Service ─────────────────────────────

const PDF_MAGIC = '%PDF-';

const evidenceInclude = {
  ingredientLinks: { include: { ingredient: { select: { id: true, name: true, inciName: true } } } },
  formulationLinks: { include: { formulation: { select: { id: true, version: true, product: { select: { id: true, name: true } } } } } },
  documents: { select: { id: true, originalName: true, sizeBytes: true, createdAt: true } },
} satisfies Prisma.EvidenceInclude;

@Injectable()
export class EvidenceService {
  constructor(private readonly prisma: PrismaService, @Inject(APP_CONFIG) private readonly config: AppConfig) {}

  async list(query: EvidenceQueryDto) {
    const where: Prisma.EvidenceWhereInput = {
      evidenceType: query.evidenceType,
      scope: query.scope,
      status: query.status,
      ...(query.ingredientId && { ingredientLinks: { some: { ingredientId: query.ingredientId } } }),
      ...(query.q && {
        OR: [
          { title: { contains: query.q, mode: 'insensitive' } },
          { sourceName: { contains: query.q, mode: 'insensitive' } },
          { testedSubject: { contains: query.q, mode: 'insensitive' } },
        ],
      }),
    };
    const [items, total] = await this.prisma.$transaction([
      this.prisma.evidence.findMany({ where, orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }], ...pageArgs(query), include: evidenceInclude }),
      this.prisma.evidence.count({ where }),
    ]);
    return paged(items, total, query);
  }

  async get(id: string) {
    const evidence = await this.prisma.evidence.findUnique({ where: { id }, include: evidenceInclude });
    if (!evidence) throw new NotFoundException('Evidence record not found');
    return evidence;
  }

  create(dto: CreateEvidenceDto, createdBy: string) {
    const { ingredientIds = [], formulationIds = [], publishedAt, ...fields } = dto;
    return this.prisma.evidence.create({
      data: {
        ...fields,
        publishedAt: publishedAt ? new Date(publishedAt) : undefined,
        createdBy,
        ingredientLinks: { create: ingredientIds.map((ingredientId) => ({ ingredientId })) },
        formulationLinks: { create: formulationIds.map((formulationId) => ({ formulationId })) },
      },
      include: evidenceInclude,
    });
  }

  async update(id: string, dto: UpdateEvidenceDto) {
    await this.get(id);
    const { ingredientIds, formulationIds, publishedAt, ...fields } = dto;
    return this.prisma.evidence.update({
      where: { id },
      data: {
        ...fields,
        ...(publishedAt && { publishedAt: new Date(publishedAt) }),
        // Replace link sets only when the client sends them.
        ...(ingredientIds && { ingredientLinks: { deleteMany: {}, create: ingredientIds.map((ingredientId) => ({ ingredientId })) } }),
        ...(formulationIds && { formulationLinks: { deleteMany: {}, create: formulationIds.map((formulationId) => ({ formulationId })) } }),
      },
      include: evidenceInclude,
    });
  }

  /** Records the already-stored file. The caller (controller) has validated type and size. */
  async attachDocument(evidenceId: string, file: Express.Multer.File) {
    await this.get(evidenceId);
    // Content check: the declared MIME type is client-controlled, so verify the real PDF signature.
    const handle = await open(file.path, 'r');
    const header = Buffer.alloc(PDF_MAGIC.length);
    await handle.read(header, 0, header.length, 0);
    await handle.close();
    if (header.toString('latin1') !== PDF_MAGIC) {
      await unlink(file.path).catch(() => undefined);
      throw new BadRequestException('The uploaded file is not a valid PDF.');
    }
    return this.prisma.uploadedDocument.create({
      data: { evidenceId, originalName: file.originalname.slice(0, 200), storedName: file.filename, mimeType: 'application/pdf', sizeBytes: file.size },
    });
  }

  /** Resolves the on-disk path from the server-generated name only; the client never supplies a path. */
  async documentForDownload(evidenceId: string) {
    const doc = await this.prisma.uploadedDocument.findFirst({ where: { evidenceId }, orderBy: { createdAt: 'desc' } });
    const path = doc ? join(this.config.uploadDir, doc.storedName) : null;
    if (!doc || !path || !existsSync(path)) throw new NotFoundException('No document has been uploaded for this evidence record.');
    return { doc, path };
  }
}

// ───────────────────────────── Controller ─────────────────────────────

const uploadConfig = loadConfig();
mkdirSync(uploadConfig.uploadDir, { recursive: true });

const pdfUpload = FileInterceptor('file', {
  limits: { fileSize: uploadConfig.maxUploadBytes, files: 1 },
  storage: diskStorage({
    destination: uploadConfig.uploadDir,
    filename: (_req, _file, cb) => cb(null, `${randomUUID()}.pdf`), // server-chosen name
  }),
  fileFilter: (_req, file, cb) =>
    file.mimetype === 'application/pdf' ? cb(null, true) : cb(new BadRequestException('Only PDF files are accepted.'), false),
});

@Controller('evidence')
export class EvidenceController {
  constructor(private readonly service: EvidenceService) {}

  @Get() list(@Query() query: EvidenceQueryDto) { return this.service.list(query); }
  @Get(':id') get(@Param('id', ParseUUIDPipe) id: string) { return this.service.get(id); }
  @Post() create(@Body() dto: CreateEvidenceDto, @Persona() persona: string) { return this.service.create(dto, persona); }
  @Patch(':id') update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateEvidenceDto) { return this.service.update(id, dto); }

  @Post(':id/upload')
  @UseInterceptors(pdfUpload)
  upload(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file?: Express.Multer.File) {
    if (!file) throw new BadRequestException('Attach a PDF in the "file" form field.');
    return this.service.attachDocument(id, file);
  }

  @Get(':id/download')
  async download(@Param('id', ParseUUIDPipe) id: string, @Res() res: Response) {
    const { doc, path } = await this.service.documentForDownload(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(doc.originalName)}"`);
    createReadStream(path).pipe(res);
  }
}

@Module({
  controllers: [EvidenceController],
  providers: [EvidenceService],
  exports: [EvidenceService],
})
export class EvidenceModule {}

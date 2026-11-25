// Small shared helpers: pagination, demo persona header, Decimal serialisation.
import { createParamDecorator, ExecutionContext, Injectable, NestInterceptor, CallHandler } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { map, Observable } from 'rxjs';

/** ?page=1&pageSize=20 on every list endpoint. */
export class PaginationQueryDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page = 1;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) pageSize = 20;
}

export interface Paged<T> {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
}

export const pageArgs = ({ page, pageSize }: PaginationQueryDto) => ({ skip: (page - 1) * pageSize, take: pageSize });

export const paged = <T>(items: T[], total: number, q: PaginationQueryDto): Paged<T> => ({
  items,
  total,
  page: q.page,
  pageSize: q.pageSize,
});

export const DEMO_PERSONAS = ['BUSINESS', 'CLAIM_MANAGER', 'SCIENTIST', 'EVALUATOR'] as const;
export type DemoPersona = (typeof DEMO_PERSONAS)[number];

/**
 * Reads the demo persona from the `x-demo-persona` header.
 * DEMO ONLY: this is a label for audit columns, NOT authentication or authorisation.
 */
export const Persona = createParamDecorator((_: unknown, ctx: ExecutionContext): string => {
  const header = ctx.switchToHttp().getRequest().headers['x-demo-persona'];
  return DEMO_PERSONAS.includes(header) ? header : 'UNKNOWN';
});

/** Prisma Decimals serialise as strings; the UI wants numbers. Convert every Decimal in a response. */
function decimalsToNumbers(value: unknown): unknown {
  if (value instanceof Prisma.Decimal) return value.toNumber();
  if (Array.isArray(value)) return value.map(decimalsToNumbers);
  if (value instanceof Date || value === null || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as object).map(([k, v]) => [k, decimalsToNumbers(v)]));
}

@Injectable()
export class DecimalInterceptor implements NestInterceptor {
  intercept(_: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(map(decimalsToNumbers));
  }
}

export { decimalsToNumbers };

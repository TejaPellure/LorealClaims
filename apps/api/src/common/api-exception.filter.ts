import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

/**
 * One error shape for the whole API:
 * { statusCode, error, message, details?, path, timestamp }
 * Internal errors are logged server-side and never leak stack traces or SQL to the client.
 */
@Catch()
export class ApiExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger('ApiError');

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();
    const { statusCode, error, message, details } = this.describe(exception);

    if (statusCode >= 500) this.logger.error(`${request.method} ${request.url}`, (exception as Error)?.stack);

    response.status(statusCode).json({
      statusCode,
      error,
      message,
      ...(details ? { details } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    });
  }

  private describe(exception: unknown): { statusCode: number; error: string; message: string; details?: unknown } {
    if (exception instanceof HttpException) {
      const statusCode = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') return { statusCode, error: exception.name, message: body };
      const payload = body as { message?: string | string[]; error?: string; details?: unknown };
      // class-validator returns an array of messages: surface them as details.
      if (Array.isArray(payload.message)) {
        return { statusCode, error: payload.error ?? 'Bad Request', message: 'Validation failed', details: payload.message };
      }
      return { statusCode, error: payload.error ?? exception.name, message: payload.message ?? exception.message, details: payload.details };
    }
    if (exception instanceof Prisma.PrismaClientKnownRequestError) return this.describePrisma(exception);
    if (exception instanceof Prisma.PrismaClientInitializationError) {
      return { statusCode: HttpStatus.SERVICE_UNAVAILABLE, error: 'Database Unavailable', message: 'The database is currently unavailable. Please retry shortly.' };
    }
    return { statusCode: HttpStatus.INTERNAL_SERVER_ERROR, error: 'Internal Server Error', message: 'Unexpected server error.' };
  }

  private describePrisma(e: Prisma.PrismaClientKnownRequestError) {
    switch (e.code) {
      case 'P2002':
        return { statusCode: 409, error: 'Conflict', message: `A record with the same ${(e.meta?.target as string[] | undefined)?.join(', ') ?? 'unique value'} already exists.` };
      case 'P2025':
        return { statusCode: 404, error: 'Not Found', message: 'The requested record was not found.' };
      case 'P2003':
        return { statusCode: 409, error: 'Conflict', message: 'The record is referenced by other data or references a missing record.' };
      default:
        return { statusCode: 500, error: 'Internal Server Error', message: 'Database error.' };
    }
  }
}

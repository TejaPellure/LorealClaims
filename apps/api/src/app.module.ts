import { Module } from '@nestjs/common';
import { APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { ServeStaticModule } from '@nestjs/serve-static';
import { join } from 'path';
import { ApiExceptionFilter } from './common/api-exception.filter';
import { DecimalInterceptor } from './common/common';
import { AppConfigModule } from './common/config.module';
import { HealthController } from './common/health.controller';
import { AssessmentsModule } from './modules/assessments/assessments.module';
import { ClaimsModule } from './modules/claims/claims.module';
import { EvidenceModule } from './modules/evidence/evidence.module';
import { IngredientsModule } from './modules/ingredients/ingredients.module';
import { ProductsModule } from './modules/products/products.module';
import { PrismaModule } from './prisma/prisma.service';

@Module({
  imports: [
    AppConfigModule,
    PrismaModule,
    // Serves the compiled React SPA. /api/* is excluded so API routes (and API 404s) never hit the SPA fallback.
    ServeStaticModule.forRoot({ rootPath: join(__dirname, '..', 'public'), exclude: ['/api/{*path}'] }),
    IngredientsModule,
    EvidenceModule,
    ProductsModule,
    ClaimsModule,
    AssessmentsModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
    { provide: APP_INTERCEPTOR, useClass: DecimalInterceptor },
  ],
})
export class AppModule {}

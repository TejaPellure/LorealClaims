import { Controller, Get, Injectable, Module, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  /** All KPIs are live database counts; nothing is hardcoded. */
  async summary() {
    const [ingredients, verifiedEvidence, products, awaiting, assessments, byVerdict, supportedBySource] = await Promise.all([
      this.prisma.ingredient.count(),
      this.prisma.evidence.count({ where: { status: 'VERIFIED' } }),
      this.prisma.product.count(),
      this.prisma.claim.count({ where: { status: { in: ['READY_FOR_ASSESSMENT', 'AWAITING_EVIDENCE'] } } }),
      this.prisma.assessment.count(),
      this.prisma.assessment.groupBy({ by: ['verdict'], _count: { _all: true } }),
      this.prisma.claim.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    const verdictCount = (v: string) => byVerdict.find((g) => g.verdict === v)?._count._all ?? 0;
    return {
      totals: {
        ingredients,
        verifiedEvidence,
        productsInDevelopment: products,
        claimsAwaitingAssessment: awaiting,
        completedAssessments: assessments,
        claimsSupported: verdictCount('SUPPORTED'),
        claimsRequiringMoreEvidence: await this.prisma.claim.count({ where: { status: 'REQUIRES_MORE_EVIDENCE' } }),
      },
      outcomeDistribution: ['SUPPORTED', 'NOT_SUPPORTED', 'INCONCLUSIVE'].map((verdict) => ({ verdict, count: verdictCount(verdict) })),
      claimsByStatus: supportedBySource.map((g) => ({ status: g.status, count: g._count._all })),
    };
  }

  async recentActivity() {
    const [products, assessments, evidence, pendingClaims] = await Promise.all([
      this.prisma.product.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, name: true, category: true, createdAt: true } }),
      this.prisma.assessment.findMany({
        orderBy: { createdAt: 'desc' }, take: 5,
        select: { id: true, verdict: true, evidenceScore: true, provider: true, createdAt: true, claim: { select: { title: true, product: { select: { name: true } } } } },
      }),
      this.prisma.evidence.findMany({ orderBy: { createdAt: 'desc' }, take: 5, select: { id: true, title: true, evidenceType: true, status: true, createdAt: true } }),
      this.prisma.claim.findMany({
        where: { status: { in: ['SUBMITTED', 'UNDER_MANAGER_REVIEW', 'ACCEPTED_FOR_FORMULATION', 'FORMULATION_IN_PROGRESS', 'AWAITING_EVIDENCE', 'READY_FOR_ASSESSMENT', 'REQUIRES_MORE_EVIDENCE'] } },
        orderBy: { updatedAt: 'desc' }, take: 8, select: { id: true, title: true, status: true, product: { select: { name: true } } },
      }),
    ]);
    return { products, assessments, evidence, pendingClaims };
  }
}

@Controller()
export class DashboardController {
  constructor(private readonly service: DashboardService, private readonly prisma: PrismaService) {}

  @Get('dashboard/summary') summary() { return this.service.summary(); }
  @Get('dashboard/recent-activity') recent() { return this.service.recentActivity(); }

  /** Liveness + database readiness. Used by Docker and by humans. */
  @Get('health')
  async health() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', database: 'up', time: new Date().toISOString() };
    } catch {
      throw new ServiceUnavailableException({ message: 'Database is not reachable.', details: { status: 'degraded', database: 'down' } });
    }
  }
}

@Module({ controllers: [DashboardController], providers: [DashboardService] })
export class DashboardModule {}

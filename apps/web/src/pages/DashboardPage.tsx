import { Link } from 'react-router-dom';
import { ClaimStatusBadge, ProviderBadge, VerdictBadge, VerificationBadge } from '@/components/badges';
import { PageHeader } from '@/components/shared';
import { Card, CardBody, CardHeader, CardTitle, EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives';
import { useAsync } from '@/hooks/hooks';
import { formatDate, humanize, VERDICT_LABEL } from '@/lib/lib';
import { api } from '@/services/api';
import type { ClaimStatus, Verdict, VerificationStatus } from '@/types';

interface Summary {
  totals: Record<'ingredients' | 'verifiedEvidence' | 'productsInDevelopment' | 'claimsAwaitingAssessment' | 'completedAssessments' | 'claimsSupported' | 'claimsRequiringMoreEvidence', number>;
  outcomeDistribution: { verdict: Verdict; count: number }[];
}
interface Activity {
  products: { id: string; name: string; category: string; createdAt: string }[];
  assessments: { id: string; verdict: Verdict; evidenceScore: number; provider: 'MOCK' | 'CLAUDE'; createdAt: string; claim: { title: string; product: { name: string } } }[];
  evidence: { id: string; title: string; evidenceType: string; status: VerificationStatus; createdAt: string }[];
  pendingClaims: { id: string; title: string; status: ClaimStatus; product: { name: string } }[];
}

const KPIS: { key: keyof Summary['totals']; label: string }[] = [
  { key: 'ingredients', label: 'Ingredients' },
  { key: 'verifiedEvidence', label: 'Verified evidence' },
  { key: 'productsInDevelopment', label: 'Products in development' },
  { key: 'claimsAwaitingAssessment', label: 'Claims awaiting assessment' },
  { key: 'completedAssessments', label: 'Completed assessments' },
  { key: 'claimsSupported', label: 'Assessments: supported' },
  { key: 'claimsRequiringMoreEvidence', label: 'Claims needing more evidence' },
];
const BAR_COLOR: Record<Verdict, string> = { SUPPORTED: 'bg-emerald-500', NOT_SUPPORTED: 'bg-red-500', INCONCLUSIVE: 'bg-amber-500' };

export default function DashboardPage() {
  const summary = useAsync(() => api.get<Summary>('/dashboard/summary'));
  const activity = useAsync(() => api.get<Activity>('/dashboard/recent-activity'));
  const totalOutcomes = summary.data?.outcomeDistribution.reduce((sum, o) => sum + o.count, 0) ?? 0;

  return (
    <>
      <PageHeader title="R&I workspace overview" description="Live view of ingredients, evidence, formulations and claim assessments." />

      {summary.error ? <Card><ErrorState message={summary.error} onRetry={summary.reload} /></Card> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-7">
          {KPIS.map(({ key, label }) => (
            <Card key={key} className="p-3">
              <p className="text-xs text-slate-500">{label}</p>
              {summary.loading ? <Skeleton className="mt-2 h-7 w-12" /> : <p className="mt-1 text-2xl font-semibold text-slate-900">{summary.data?.totals[key]}</p>}
            </Card>
          ))}
        </div>
      )}

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <Card>
          <CardHeader><CardTitle>Assessment outcomes</CardTitle></CardHeader>
          <CardBody className="space-y-3">
            {summary.loading ? <Skeleton className="h-24 w-full" /> : totalOutcomes === 0 ? <EmptyState title="No assessments yet" description="Run an assessment from the Claims page." /> :
              summary.data?.outcomeDistribution.map(({ verdict, count }) => (
                <div key={verdict}>
                  <div className="mb-1 flex justify-between text-xs text-slate-600"><span>{VERDICT_LABEL[verdict]}</span><span>{count}</span></div>
                  <div className="h-2 rounded-full bg-slate-100"><div className={`h-2 rounded-full ${BAR_COLOR[verdict]}`} style={{ width: `${(count / totalOutcomes) * 100}%` }} /></div>
                </div>
              ))}
          </CardBody>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader><CardTitle>Pending workflow actions</CardTitle><Link to="/claims" className="text-xs text-teal-700 hover:underline">All claims</Link></CardHeader>
          <CardBody className="p-0">
            {activity.loading ? <Skeleton className="m-4 h-24" /> : activity.error ? <ErrorState message={activity.error} onRetry={activity.reload} /> :
              !activity.data?.pendingClaims.length ? <EmptyState title="Nothing pending" /> : (
                <ul className="divide-y divide-slate-100">
                  {activity.data.pendingClaims.map((c) => (
                    <li key={c.id} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                      <div className="min-w-0"><p className="truncate font-medium text-slate-900">{c.title}</p><p className="text-xs text-slate-500">{c.product.name}</p></div>
                      <ClaimStatusBadge status={c.status} />
                    </li>
                  ))}
                </ul>
              )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Latest assessments</CardTitle><Link to="/history" className="text-xs text-teal-700 hover:underline">History</Link></CardHeader>
          <CardBody className="p-0">
            {activity.loading ? <Skeleton className="m-4 h-24" /> : !activity.data?.assessments.length ? <EmptyState title="No assessments yet" /> : (
              <ul className="divide-y divide-slate-100">
                {activity.data.assessments.map((a) => (
                  <li key={a.id}>
                    <Link to={`/assessments/${a.id}`} className="block px-4 py-2.5 text-sm hover:bg-slate-50">
                      <p className="truncate font-medium text-slate-900">{a.claim.title}</p>
                      <p className="mb-1 text-xs text-slate-500">{a.claim.product.name} - {formatDate(a.createdAt)}</p>
                      <div className="flex items-center gap-2"><VerdictBadge verdict={a.verdict} /><span className="text-xs text-slate-600">{a.evidenceScore}/100</span><ProviderBadge provider={a.provider} /></div>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recently created products</CardTitle><Link to="/studio" className="text-xs text-teal-700 hover:underline">Studio</Link></CardHeader>
          <CardBody className="p-0">
            {activity.loading ? <Skeleton className="m-4 h-24" /> : !activity.data?.products.length ? <EmptyState title="No products yet" /> : (
              <ul className="divide-y divide-slate-100">
                {activity.data.products.map((p) => (
                  <li key={p.id} className="px-4 py-2.5 text-sm"><p className="font-medium text-slate-900">{p.name}</p><p className="text-xs text-slate-500">{p.category} - {formatDate(p.createdAt)}</p></li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>

        <Card>
          <CardHeader><CardTitle>Recent research uploads</CardTitle><Link to="/evidence" className="text-xs text-teal-700 hover:underline">Library</Link></CardHeader>
          <CardBody className="p-0">
            {activity.loading ? <Skeleton className="m-4 h-24" /> : !activity.data?.evidence.length ? <EmptyState title="No evidence yet" /> : (
              <ul className="divide-y divide-slate-100">
                {activity.data.evidence.map((e) => (
                  <li key={e.id} className="px-4 py-2.5 text-sm">
                    <p className="line-clamp-2 font-medium text-slate-900">{e.title}</p>
                    <div className="mt-1 flex items-center gap-2 text-xs text-slate-500">{humanize(e.evidenceType)}<VerificationBadge status={e.status} /></div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      </div>
    </>
  );
}

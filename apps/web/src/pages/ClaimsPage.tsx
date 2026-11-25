import { ArrowRight } from 'lucide-react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { VerdictBadge } from '@/components/badges';
import { PageHeader } from '@/components/shared';
import { Button, Card, CardHeader, CardTitle, EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives';
import { ClaimForm } from '@/features/claims/ClaimForm';
import { useAsync } from '@/hooks/hooks';
import { formatDate, humanize } from '@/lib/lib';
import { api } from '@/services/api';
import type { Claim, Paged, Product } from '@/types';

/** Steps 2 and 3: write a claim, get Claude's evaluation. Past claims are listed below with their verdicts. */
export default function ClaimsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const products = useAsync(() => api.get<Paged<Product>>('/products', { pageSize: 100 }));
  const claims = useAsync(() => api.get<Paged<Claim>>('/claims', { pageSize: 50 }));

  return (
    <>
      <PageHeader eyebrow="Step 2 of 3 · Claim" title="What would you like to claim?" description="Write the claim and Claude evaluates it against your formula and the evidence library straight away." />

      <Card className="mb-12">
        {products.loading ? <div className="p-8"><Skeleton className="h-40 w-full" /></div> : products.error ? <ErrorState message={products.error} onRetry={products.reload} /> :
          !products.data?.items.length ? (
            <EmptyState title="Create a product first" description="A claim is evaluated against a formula." action={<Button onClick={() => navigate('/')}>Go to Formulate</Button>} />
          ) : <ClaimForm products={products.data.items} initialProductId={params.get('product') ?? undefined} />}
      </Card>

      <section aria-labelledby="past-claims">
        <p className="eyebrow mb-2">Step 3 · Results</p>
        <h2 id="past-claims" className="mb-4 font-display text-3xl font-semibold">Your evaluated claims</h2>
        <Card>
          {claims.loading ? <div className="space-y-2 p-4"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div> : claims.error ? <ErrorState message={claims.error} onRetry={claims.reload} /> :
            !claims.data?.items.length ? <EmptyState title="No claims yet" description="Your evaluated claims will appear here." /> : (
              <ul className="divide-y divide-slate-100">
                {claims.data.items.map((c) => {
                  const latest = c.assessments[0];
                  return (
                    <li key={c.id}>
                      <Link to={latest ? `/assessments/${latest.id}` : '/claims'} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 hover:bg-slate-50">
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-lg font-medium text-slate-900">{c.title}</p>
                          <p className="text-sm text-slate-500">{c.product.name} · {humanize(c.benefitCategory)} · {c.targetValue}{c.measurementUnit} in {c.durationWeeks} wk · {formatDate(c.createdAt)}</p>
                        </div>
                        {latest ? <div className="flex items-center gap-3"><VerdictBadge verdict={latest.verdict} /><span className="text-sm tabular-nums text-slate-600">{latest.evidenceScore}/100</span><ArrowRight className="h-4 w-4 text-slate-400" aria-hidden /></div>
                          : <span className="text-sm text-slate-500">Not evaluated</span>}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
        </Card>
      </section>
    </>
  );
}

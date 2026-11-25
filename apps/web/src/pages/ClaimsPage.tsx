import { ArrowRight, ChevronDown, History } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { VerdictBadge } from '@/components/badges';
import { PageHeader } from '@/components/shared';
import { Button, Card, EmptyState, ErrorState, Skeleton } from '@/components/ui/primitives';
import { ClaimForm } from '@/features/claims/ClaimForm';
import { useAsync } from '@/hooks/hooks';
import { benefitLabel, cn, formatDate } from '@/lib/lib';
import { api } from '@/services/api';
import type { Claim, Paged, Product } from '@/types';

/** One-line summary of a claim's optional numbers, e.g. "20% in 4 wk". */
const targetSummary = (c: Claim) => [c.targetValue != null ? `${c.targetValue}${c.measurementUnit}` : null, c.durationWeeks != null ? `in ${c.durationWeeks} wk` : null].filter(Boolean).join(' ');

/** Steps 2 and 3: write a claim, get Claude's evaluation. Past claims sit behind the History button. */
export default function ClaimsPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [showHistory, setShowHistory] = useState(false);
  const products = useAsync(() => api.get<Paged<Product>>('/products', { pageSize: 100 }));
  const claims = useAsync(() => api.get<Paged<Claim>>('/claims', { pageSize: 50 }));

  return (
    <>
      <PageHeader
        eyebrow="Step 2 of 3 · Claim" title="What would you like to claim?"
        description="Write the claim and Claude evaluates it against your formula and the evidence library straight away."
        actions={
          <Button variant="secondary" aria-expanded={showHistory} onClick={() => setShowHistory((open) => !open)}>
            <History className="h-4 w-4" />History{claims.data ? ` (${claims.data.total})` : ''}
            <ChevronDown className={cn('h-4 w-4 transition-transform', showHistory && 'rotate-180')} aria-hidden />
          </Button>
        }
      />

      {showHistory && (
        <section aria-labelledby="past-claims" className="mb-10">
          <h2 id="past-claims" className="mb-4 font-display text-3xl font-semibold">Your evaluated claims</h2>
          <Card>
            {claims.loading ? <div className="space-y-2 p-4"><Skeleton className="h-14 w-full" /><Skeleton className="h-14 w-full" /></div> : claims.error ? <ErrorState message={claims.error} onRetry={claims.reload} /> :
              !claims.data?.items.length ? <EmptyState title="No claims yet" description="Your evaluated claims will appear here." /> : (
                <ul className="divide-y divide-slate-100">
                  {claims.data.items.map((c) => {
                    const latest = c.assessments[0];
                    const row = (
                      <>
                        <div className="min-w-0 flex-1">
                          <p className="truncate font-display text-lg font-medium text-slate-900">{c.title}</p>
                          <p className="text-sm text-slate-500">
                            {[c.product.name, c.benefits.map(benefitLabel).join(', ') || null, targetSummary(c) || null, formatDate(c.createdAt)].filter(Boolean).join(' · ')}
                          </p>
                        </div>
                        {latest
                          ? <div className="flex items-center gap-3"><VerdictBadge verdict={latest.verdict} /><span className="text-sm tabular-nums text-slate-600">{latest.evidenceScore}/100</span><ArrowRight className="h-4 w-4 text-slate-400" aria-hidden /></div>
                          : <span className="text-sm text-slate-500">Not evaluated</span>}
                      </>
                    );
                    return (
                      <li key={c.id}>
                        {latest
                          ? <Link to={`/assessments/${latest.id}`} className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4 hover:bg-slate-50">{row}</Link>
                          : <div className="flex flex-wrap items-center gap-x-6 gap-y-2 px-5 py-4">{row}</div>}
                      </li>
                    );
                  })}
                </ul>
              )}
          </Card>
        </section>
      )}

      <Card>
        {products.loading ? <div className="p-8"><Skeleton className="h-40 w-full" /></div> : products.error ? <ErrorState message={products.error} onRetry={products.reload} /> :
          !products.data?.items.length ? (
            <EmptyState title="Create a product first" description="A claim is evaluated against a formula." action={<Button onClick={() => navigate('/')}>Go to Formulate</Button>} />
          ) : <ClaimForm products={products.data.items} initialProductId={params.get('product') ?? undefined} />}
      </Card>
    </>
  );
}

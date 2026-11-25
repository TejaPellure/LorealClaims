// Small reusable building blocks shared by several pages.
import { Download, ExternalLink } from 'lucide-react';
import type { ReactNode } from 'react';
import { Badge, Button, Dialog, ErrorState, Skeleton } from '@/components/ui/primitives';
import { QualityBadge, ScopeBadge, VerificationBadge } from '@/components/badges';
import { useAsync } from '@/hooks/hooks';
import { benefitLabel, cn, formatDate, humanize } from '@/lib/lib';
import { api } from '@/services/api';
import type { Evidence } from '@/types';

/** Editorial page heading: small step label, serif title, short description. */
export function PageHeader({ eyebrow, title, description, actions }: { eyebrow?: string; title: string; description?: string; actions?: ReactNode }) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-display text-4xl font-semibold leading-tight text-slate-900 sm:text-5xl">{title}</h1>
        {description && <p className="mt-3 max-w-2xl text-base text-slate-600">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Label / value row used in detail dialogs and reports. Hides itself when there is no value. */
export function Detail({ label, children }: { label: string; children?: ReactNode }) {
  if (children === undefined || children === null || children === '') return null;
  return (
    <div className="grid grid-cols-3 gap-2 border-b border-slate-100 py-2 text-sm last:border-0">
      <dt className="text-slate-500">{label}</dt>
      <dd className="col-span-2 text-slate-900">{children}</dd>
    </div>
  );
}

export function BulletList({ items, empty }: { items: string[]; empty: string }) {
  if (!items.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return <ul className="list-disc space-y-1.5 pl-5 text-sm text-slate-800">{items.map((item, i) => <li key={i}>{item}</li>)}</ul>;
}

/** Search/filter bar layout. */
export const FilterBar = ({ children, className }: { children: ReactNode; className?: string }) =>
  <div className={cn('flex flex-wrap items-end gap-3 border-b border-slate-100 p-4', className)}>{children}</div>;

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (page: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
      <span>{total} record{total === 1 ? '' : 's'}</span>
      <div className="flex items-center gap-2">
        <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <span>Page {page} of {pages}</span>
        <Button variant="secondary" size="sm" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}

/** Full evidence record in a dialog, with source links and the uploaded PDF (traceability from reports). */
export function EvidenceDetailDialog({ evidenceId, onClose }: { evidenceId: string | null; onClose: () => void }) {
  const { data, error, loading, reload } = useAsync(() => (evidenceId ? api.get<Evidence>(`/evidence/${evidenceId}`) : Promise.resolve(null)), [evidenceId]);
  return (
    <Dialog open={!!evidenceId} onOpenChange={(open) => !open && onClose()} title={data?.title ?? 'Evidence record'} description="Source-backed study metadata" wide>
      {loading && !data && <Skeleton className="h-64 w-full" />}
      {error && <ErrorState message={error} onRetry={reload} />}
      {data && (
        <div className="space-y-3">
          <div className="flex flex-wrap gap-2">
            <VerificationBadge status={data.status} /><ScopeBadge scope={data.scope} /><QualityBadge quality={data.quality} />
            <Badge>{humanize(data.evidenceType)}</Badge>
          </div>
          <dl>
            <Detail label="Benefits measured">{data.benefits.map(benefitLabel).join(", ")}</Detail>
            <Detail label="Source">{data.sourceName}</Detail>
            <Detail label="DOI">{data.doi && <a className="inline-flex items-center gap-1 text-teal-700 hover:underline" href={`https://doi.org/${data.doi}`} target="_blank" rel="noreferrer noopener">{data.doi}<ExternalLink className="h-3 w-3" /></a>}</Detail>
            <Detail label="PMID">{data.pmid && <a className="inline-flex items-center gap-1 text-teal-700 hover:underline" href={`https://pubmed.ncbi.nlm.nih.gov/${data.pmid}/`} target="_blank" rel="noreferrer noopener">{data.pmid}<ExternalLink className="h-3 w-3" /></a>}</Detail>
            <Detail label="Published">{formatDate(data.publishedAt)}</Detail>
            <Detail label="Study design">{data.studyDesign}</Detail>
            <Detail label="Sample size">{data.sampleSize}</Detail>
            <Detail label="Population">{data.population}</Detail>
            <Detail label="Duration">{data.durationWeeks ? `${data.durationWeeks} weeks` : undefined}</Detail>
            <Detail label="Tested subject">{data.testedSubject}</Detail>
            <Detail label="Tested concentration">{data.testedConcentration != null ? `${data.testedConcentration}%` : undefined}</Detail>
            <Detail label="Endpoint">{data.endpoint}</Detail>
            <Detail label="Results">{data.resultsSummary}</Detail>
            <Detail label="Reported effect">{data.effectMagnitude != null ? `${data.effectMagnitude}%` : undefined}</Detail>
            <Detail label="Limitations">{data.limitations}</Detail>
            <Detail label="Ingredients">{data.ingredientLinks?.length ? data.ingredientLinks.map((l) => l.ingredient.name).join(', ') : undefined}</Detail>
            <Detail label="Products">{data.formulationLinks?.length ? data.formulationLinks.map((l) => l.formulation.product.name).join(', ') : undefined}</Detail>
          </dl>
          <div className="flex flex-wrap gap-2">
            {data.sourceUrl && <Button asChild variant="secondary" size="sm"><a href={data.sourceUrl} target="_blank" rel="noreferrer noopener"><ExternalLink className="h-4 w-4" />Open source</a></Button>}
            {data.documents?.length ? <Button asChild variant="secondary" size="sm"><a href={api.downloadUrl(data.id)}><Download className="h-4 w-4" />Download PDF ({data.documents[0].originalName})</a></Button> : null}
          </div>
        </div>
      )}
    </Dialog>
  );
}

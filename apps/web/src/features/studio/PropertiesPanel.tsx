import { useState } from 'react';
import { ScopeBadge, VerificationBadge } from '@/components/badges';
import { EvidenceDetailDialog } from '@/components/shared';
import { Badge, Skeleton, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/primitives';
import { ClaimForm } from '@/features/claims/ClaimForm';
import { useAsync } from '@/hooks/hooks';
import { humanize } from '@/lib/lib';
import { api } from '@/services/api';
import type { Claim, Evidence, Formulation, Ingredient, Product } from '@/types';

/** Right-hand panel: details of the selected ingredient and the proposed claim for the saved formulation. */
export function PropertiesPanel({ ingredient, percentage, formulation, product, onClaimCreated }: {
  ingredient: Ingredient | null; percentage: string; formulation: Formulation | null; product: Product | null; onClaimCreated: (claim: Claim) => void;
}) {
  const [evidenceId, setEvidenceId] = useState<string | null>(null);
  const evidence = useAsync(() => (ingredient ? api.get<Evidence[]>(`/ingredients/${ingredient.id}/evidence`) : Promise.resolve([])), [ingredient?.id]);
  const value = Number(percentage);
  const outOfRange = ingredient && Number.isFinite(value) && value > 0 && (
    (ingredient.minConcentration != null && value < ingredient.minConcentration) || (ingredient.maxConcentration != null && value > ingredient.maxConcentration)
  );

  return (
    <section className="min-w-0 rounded-lg border border-slate-200 bg-white p-3" aria-label="Properties">
      <Tabs defaultValue="ingredient">
        <TabsList><TabsTrigger value="ingredient">Ingredient</TabsTrigger><TabsTrigger value="claim">Proposed claim</TabsTrigger></TabsList>

        <TabsContent value="ingredient" className="space-y-3">
          {!ingredient ? <p className="py-6 text-center text-sm text-slate-500">Select an ingredient in the canvas to see its details and evidence.</p> : (
            <>
              <div>
                <p className="font-semibold text-slate-900">{ingredient.name}</p>
                <p className="text-xs text-slate-500">{ingredient.inciName}</p>
                <div className="mt-1 flex flex-wrap gap-1"><Badge>{humanize(ingredient.category)}</Badge><VerificationBadge status={ingredient.status} /></div>
              </div>
              <p className="text-sm text-slate-700">{ingredient.description}</p>
              <p className="text-sm"><span className="text-slate-500">Concentration in formula:</span> <strong>{percentage || '-'}%</strong></p>
              {ingredient.minConcentration != null || ingredient.maxConcentration != null ? (
                <p className={`rounded-md border p-2 text-xs ${outOfRange ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-slate-200 bg-slate-50 text-slate-600'}`}>
                  Reference range: {ingredient.minConcentration ?? '-'} to {ingredient.maxConcentration ?? '-'}% ({ingredient.concentrationSource}). {outOfRange ? 'Current value is outside it. ' : ''}A range is context, not proof of safety or efficacy.
                </p>
              ) : <p className="text-xs text-slate-500">No sourced reference range is recorded for this ingredient.</p>}
              {ingredient.compatibilityNotes && <p className="text-xs text-slate-600"><strong>Compatibility:</strong> {ingredient.compatibilityNotes}</p>}
              <div>
                <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Associated evidence ({evidence.data?.length ?? 0})</h3>
                {evidence.loading ? <Skeleton className="h-12 w-full" /> : !evidence.data?.length ? <p className="text-sm text-slate-500">No evidence linked.</p> : (
                  <ul className="space-y-1.5">
                    {evidence.data.map((e) => (
                      <li key={e.id}>
                        <button onClick={() => setEvidenceId(e.id)} className="w-full cursor-pointer rounded-md border border-slate-200 p-2 text-left hover:bg-slate-50">
                          <span className="line-clamp-2 text-xs font-medium text-slate-800">{e.title}</span>
                          <span className="mt-1 flex gap-1"><ScopeBadge scope={e.scope} /><VerificationBadge status={e.status} /></span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </>
          )}
        </TabsContent>

        <TabsContent value="claim">
          {!product || !formulation ? (
            <p className="py-6 text-center text-sm text-slate-500">Save the formulation first. A claim is always linked to one exact saved version.</p>
          ) : (
            <>
              <p className="mb-3 rounded-md bg-slate-50 p-2 text-xs text-slate-600">Claim for <strong>{product.name} v{formulation.version}</strong> ({formulation.status.toLowerCase()}).</p>
              <ClaimForm key={formulation.id} products={[product]} productId={product.id} formulationId={formulation.id} onCreated={onClaimCreated} submitLabel="Create claim" />
            </>
          )}
        </TabsContent>
      </Tabs>
      <EvidenceDetailDialog evidenceId={evidenceId} onClose={() => setEvidenceId(null)} />
    </section>
  );
}

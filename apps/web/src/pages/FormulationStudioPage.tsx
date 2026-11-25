import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { FilePlus2, Lock, Plus, Save } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { BasisBadge } from '@/components/badges';
import { PageHeader } from '@/components/shared';
import { Button, Dialog, Field, FormError, Input, Select } from '@/components/ui/primitives';
import { FormulationCanvas, type CanvasLine } from '@/features/studio/FormulationCanvas';
import { IngredientExplorer } from '@/features/studio/IngredientExplorer';
import { PropertiesPanel } from '@/features/studio/PropertiesPanel';
import { useAsync } from '@/hooks/hooks';
import { compositionOf } from '@/lib/lib';
import { api, errorText } from '@/services/api';
import type { Formulation, Ingredient, Paged, Product } from '@/types';

function NewProductDialog({ open, onClose, onCreated }: { open: boolean; onClose: () => void; onCreated: (product: Product) => void }) {
  const [values, setValues] = useState({ name: '', category: 'Facial serum', description: '' });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      onCreated(await api.post<Product>('/products', values));
      setValues({ name: '', category: 'Facial serum', description: '' });
      onClose();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()} title="New product" description="Create the product, then build its first formulation.">
      <form onSubmit={submit} className="space-y-3">
        <Field label="Product name *"><Input required minLength={2} value={values.name} onChange={(e) => setValues({ ...values, name: e.target.value })} /></Field>
        <Field label="Category *"><Input required value={values.category} onChange={(e) => setValues({ ...values, category: e.target.value })} /></Field>
        <Field label="Description *"><Input required minLength={3} value={values.description} onChange={(e) => setValues({ ...values, description: e.target.value })} /></Field>
        <FormError message={error} />
        <div className="flex justify-end gap-2"><Button type="button" variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" loading={saving}>Create product</Button></div>
      </form>
    </Dialog>
  );
}

const toLines = (f: Formulation): CanvasLine[] => f.ingredients.map((l) => ({ ingredient: l.ingredient, percentage: String(l.percentage) }));

export default function FormulationStudioPage() {
  const navigate = useNavigate();
  const ingredients = useAsync(() => api.get<Paged<Ingredient>>('/ingredients', { pageSize: 100 }));
  const products = useAsync(() => api.get<Paged<Product>>('/products', { pageSize: 100 }));
  const [productId, setProductId] = useState('');
  const versions = useAsync(() => (productId ? api.get<Formulation[]>(`/products/${productId}/formulations`) : Promise.resolve([])), [productId]);

  const [lines, setLines] = useState<CanvasLine[]>([]);
  const [loaded, setLoaded] = useState<Formulation | null>(null); // the saved version currently on the canvas
  const [notes, setNotes] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Ingredient | null>(null);
  const [saving, setSaving] = useState<'DRAFT' | 'FINAL' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [newProduct, setNewProduct] = useState(false);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const product = products.data?.items.find((p) => p.id === productId) ?? null;
  const readOnly = loaded?.status === 'FINAL';
  const composition = compositionOf(lines.map((l) => Number(l.percentage)));
  const usedIds = useMemo(() => new Set(lines.map((l) => l.ingredient.id)), [lines]);
  const selected = lines.find((l) => l.ingredient.id === selectedId) ?? null;

  // Pick the first product once the list arrives.
  useEffect(() => { if (!productId && products.data?.items.length) setProductId(products.data.items[0].id); }, [products.data, productId]);
  // When the product changes, show its latest version (or a blank canvas).
  useEffect(() => {
    if (!versions.data) return;
    const latest = versions.data[0] ?? null;
    setLoaded(latest);
    setLines(latest ? toLines(latest) : []);
    setNotes(latest?.notes ?? '');
    setSelectedId(null);
  }, [versions.data]);

  const addIngredient = (ingredient: Ingredient, at?: number) => {
    if (readOnly || usedIds.has(ingredient.id)) return;
    setLines((current) => {
      const next = [...current];
      next.splice(at ?? next.length, 0, { ingredient, percentage: '' });
      return next;
    });
    setSelectedId(ingredient.id);
  };

  const onDragStart = (event: DragStartEvent) => {
    const id = String(event.active.id);
    if (id.startsWith('lib:')) setDragging(ingredients.data?.items.find((i) => i.id === id.slice(4)) ?? null);
  };

  const onDragEnd = ({ active, over }: DragEndEvent) => {
    setDragging(null);
    if (!over) return;
    const activeId = String(active.id);
    const overId = String(over.id);
    if (activeId.startsWith('lib:')) {
      const ingredient = ingredients.data?.items.find((i) => i.id === activeId.slice(4));
      const overIndex = lines.findIndex((l) => `line:${l.ingredient.id}` === overId);
      if (ingredient) addIngredient(ingredient, overIndex >= 0 ? overIndex : undefined);
    } else if (activeId !== overId && !readOnly) {
      setLines((current) => {
        const from = current.findIndex((l) => `line:${l.ingredient.id}` === activeId);
        const to = current.findIndex((l) => `line:${l.ingredient.id}` === overId);
        return from < 0 || to < 0 ? current : arrayMove(current, from, to);
      });
    }
  };

  /** Puts whatever is unassigned into the first BASE ingredient (usually purified water). */
  const balanceWithBase = () =>
    setLines((current) => {
      const baseIndex = current.findIndex((l) => l.ingredient.category === 'BASE');
      if (baseIndex < 0) return current;
      const others = current.reduce((sum, l, i) => (i === baseIndex ? sum : sum + (Number(l.percentage) || 0)), 0);
      const balance = Math.max(0, Math.round((100 - others) * 10000) / 10000);
      return current.map((l, i) => (i === baseIndex ? { ...l, percentage: String(balance) } : l));
    });

  const startBlank = () => { setLoaded(null); setLines([]); setNotes(''); setSelectedId(null); setError(null); };
  const loadVersion = (id: string) => {
    const version = versions.data?.find((v) => v.id === id);
    if (version) { setLoaded(version); setLines(toLines(version)); setNotes(version.notes ?? ''); setSelectedId(null); setError(null); }
  };

  /**
   * Save rules (the server enforces them too):
   *  - editing a DRAFT updates it in place; finalising makes it immutable;
   *  - changing a FINAL version, or starting from blank, always creates a NEW version.
   */
  const save = async (status: 'DRAFT' | 'FINAL') => {
    setError(null);
    if (!productId) return setError('Create or select a product first.');
    if (lines.some((l) => !(Number(l.percentage) > 0))) return setError('Every ingredient needs a concentration greater than 0%.');
    if (status === 'FINAL' && composition.status !== 'VALID') return setError(`The formula totals ${composition.total}%. It must total exactly 100% to be saved as a final version.`);
    setSaving(status);
    const body = { ingredients: lines.map((l) => ({ ingredientId: l.ingredient.id, percentage: Number(l.percentage) })), notes: notes || undefined, status };
    try {
      let saved: Formulation;
      if (loaded?.status === 'DRAFT') saved = await api.patch<Formulation>(`/formulations/${loaded.id}`, body);
      else if (loaded) saved = await api.post<Formulation>(`/formulations/${loaded.id}/versions`, body);
      else saved = await api.post<Formulation>('/formulations', { productId, ...body });
      toast.success(status === 'FINAL' ? `Saved final version v${saved.version}` : `Draft v${saved.version} saved`);
      setLoaded(saved);
      versions.reload();
      products.reload();
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(null);
    }
  };

  const noProducts = !products.loading && !products.data?.items.length;

  return (
    <>
      <PageHeader
        title="Formulation Studio"
        description="Drag ingredients onto the canvas, set concentrations and save versioned formulations. Each claim is bound to one exact saved version."
        actions={
          <>
            <Button variant="secondary" onClick={() => setNewProduct(true)}><Plus className="h-4 w-4" />New product</Button>
            <Button variant="secondary" onClick={startBlank} disabled={!productId}><FilePlus2 className="h-4 w-4" />New formulation</Button>
          </>
        }
      />

      {/* Formulation toolbar */}
      <div className="mb-3 flex flex-wrap items-end gap-3 rounded-lg border border-slate-200 bg-white p-3">
        <Field label="Product" className="w-60">
          <Select value={productId} onChange={(e) => setProductId(e.target.value)} disabled={noProducts}>
            {noProducts && <option value="">No products yet</option>}{products.data?.items.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </Select>
        </Field>
        <Field label="Formulation version" className="w-52">
          <Select value={loaded?.id ?? ''} onChange={(e) => (e.target.value ? loadVersion(e.target.value) : startBlank())}>
            <option value="">New (unsaved)</option>{versions.data?.map((v) => <option key={v.id} value={v.id}>v{v.version} - {v.status.toLowerCase()}</option>)}
          </Select>
        </Field>
        <Field label="Version notes" className="min-w-48 flex-1"><Input value={notes} readOnly={readOnly} onChange={(e) => setNotes(e.target.value)} placeholder="What changed in this version?" /></Field>
        <div className="flex flex-wrap items-center gap-2 pb-0.5">
          {loaded && <BasisBadge basis={loaded.basis} />}
          {readOnly && <span className="flex items-center gap-1 text-xs text-slate-600"><Lock className="h-3.5 w-3.5" aria-hidden />Final versions are locked; saving creates a new version.</span>}
        </div>
      </div>

      {loaded?.basis === 'ILLUSTRATIVE' && <p className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">Illustrative reconstruction for demonstration. Not a manufacturer's actual formulation.</p>}

      {noProducts ? (
        <div className="rounded-lg border border-slate-200 bg-white p-10 text-center text-sm text-slate-600">Create a product to start formulating.</div>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <div className="grid gap-3 lg:grid-cols-[16rem_minmax(0,1fr)] xl:grid-cols-[17rem_minmax(0,1fr)_21rem]">
            <IngredientExplorer ingredients={ingredients.data?.items ?? []} loading={ingredients.loading} usedIds={usedIds} onAdd={(i) => addIngredient(i)} />
            <div className="space-y-3">
              <FormulationCanvas lines={lines} selectedId={selectedId} readOnly={readOnly} onSelect={setSelectedId} onBalance={balanceWithBase}
                onChange={(id, value) => setLines((cur) => cur.map((l) => (l.ingredient.id === id ? { ...l, percentage: value } : l)))}
                onRemove={(id) => { setLines((cur) => cur.filter((l) => l.ingredient.id !== id)); if (selectedId === id) setSelectedId(null); }} />
              <FormError message={error} />
              <div className="flex flex-wrap justify-end gap-2">
                <Button variant="secondary" loading={saving === 'DRAFT'} disabled={!lines.length || saving !== null} onClick={() => save('DRAFT')}><Save className="h-4 w-4" />{readOnly ? 'Save as new draft version' : 'Save draft'}</Button>
                <Button loading={saving === 'FINAL'} disabled={composition.status !== 'VALID' || saving !== null} onClick={() => save('FINAL')} title={composition.status !== 'VALID' ? 'The formula must total exactly 100%' : undefined}>
                  {readOnly ? 'Save as new final version' : 'Save final version'}
                </Button>
                {loaded?.claims && loaded.claims.length > 0 && <Button variant="ghost" onClick={() => navigate('/claims')}>{loaded.claims.length} claim(s) on this version</Button>}
              </div>
            </div>
            <div className="lg:col-span-2 xl:col-span-1">
              <PropertiesPanel ingredient={selected?.ingredient ?? null} percentage={selected?.percentage ?? ''} formulation={loaded} product={product}
                onClaimCreated={() => { toast.success('Open the Claims page to continue the workflow.'); versions.reload(); }} />
            </div>
          </div>
          <DragOverlay>{dragging && <div className="rounded-md border border-teal-600 bg-white px-3 py-2 text-sm font-medium shadow-lg">{dragging.name}</div>}</DragOverlay>
        </DndContext>
      )}

      <NewProductDialog open={newProduct} onClose={() => setNewProduct(false)} onCreated={(p) => { setProductId(p.id); products.reload(); toast.success(`Product "${p.name}" created`); }} />
    </>
  );
}

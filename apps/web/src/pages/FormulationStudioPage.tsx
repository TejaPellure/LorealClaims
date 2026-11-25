import { DndContext, DragOverlay, KeyboardSensor, PointerSensor, closestCenter, useSensor, useSensors, type DragEndEvent, type DragStartEvent } from '@dnd-kit/core';
import { arrayMove, sortableKeyboardCoordinates } from '@dnd-kit/sortable';
import { ArrowRight, CheckCircle2, Plus, Save } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import { PageHeader } from '@/components/shared';
import { Button, Card, CardBody } from '@/components/ui/primitives';
import { FormulationCanvas, type CanvasLine } from '@/features/studio/FormulationCanvas';
import { IngredientExplorer } from '@/features/studio/IngredientExplorer';
import { useAsync } from '@/hooks/hooks';
import { compositionOf, humanize } from '@/lib/lib';
import { api, errorText } from '@/services/api';
import type { Ingredient, Paged, Product } from '@/types';

/** Step 1: name a product, add ingredients, make them total 100%, save. A product is always new. */
export default function FormulationStudioPage() {
  const navigate = useNavigate();
  const ingredients = useAsync(() => api.get<Paged<Ingredient>>('/ingredients', { pageSize: 100 }));
  const [name, setName] = useState('');
  const [lines, setLines] = useState<CanvasLine[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [dragging, setDragging] = useState<Ingredient | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Product | null>(null);

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }), useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }));
  const composition = compositionOf(lines.map((l) => Number(l.percentage)));
  const usedIds = useMemo(() => new Set(lines.map((l) => l.ingredient.id)), [lines]);
  const selected = lines.find((l) => l.ingredient.id === selectedId)?.ingredient ?? null;
  const canSave = name.trim().length >= 2 && composition.status === 'VALID' && !saving;

  const addIngredient = (ingredient: Ingredient, at?: number) => {
    if (usedIds.has(ingredient.id)) return;
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
    } else if (activeId !== overId) {
      setLines((current) => {
        const from = current.findIndex((l) => `line:${l.ingredient.id}` === activeId);
        const to = current.findIndex((l) => `line:${l.ingredient.id}` === overId);
        return from < 0 || to < 0 ? current : arrayMove(current, from, to);
      });
    }
  };

  /**
   * Gets the formula to 100%.
   *  - If some ingredients have no concentration yet, the unassigned percentage is shared evenly between them
   *    (water included); any rounding remainder goes to the base ingredient.
   *  - If every ingredient already has a value, the base ingredient (usually water) absorbs the difference.
   * Works in integer units of 0.0001% so the total is exact.
   */
  const balanceFormula = () =>
    setLines((current) => {
      const scaled = (l: CanvasLine) => Math.round((Number(l.percentage) || 0) * 10000);
      const assigned = current.reduce((sum, l) => sum + scaled(l), 0);
      const baseIndex = current.findIndex((l) => l.ingredient.category === 'BASE');
      const emptyIndexes = current.flatMap((l, i) => (scaled(l) > 0 ? [] : [i]));
      const remaining = 1_000_000 - assigned;

      if (remaining > 0 && emptyIndexes.length > 0) {
        const share = Math.floor(remaining / emptyIndexes.length);
        const remainderTo = emptyIndexes.includes(baseIndex) ? baseIndex : emptyIndexes[emptyIndexes.length - 1];
        const remainder = remaining - share * emptyIndexes.length;
        return current.map((l, i) => (emptyIndexes.includes(i) ? { ...l, percentage: String((share + (i === remainderTo ? remainder : 0)) / 10000) } : l));
      }
      if (baseIndex < 0) return current;
      const others = assigned - scaled(current[baseIndex]);
      return current.map((l, i) => (i === baseIndex ? { ...l, percentage: String(Math.max(0, 1_000_000 - others) / 10000) } : l));
    });

  const save = async () => {
    setSaving(true);
    setError(null);
    try {
      const product = await api.post<Product>('/products', {
        name: name.trim(),
        ingredients: lines.map((l) => ({ ingredientId: l.ingredient.id, percentage: Number(l.percentage) })),
      });
      setCreated(product);
      toast.success(`"${product.name}" saved`);
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  const startAnother = () => { setCreated(null); setName(''); setLines([]); setSelectedId(null); setError(null); };

  return (
    <>
      <PageHeader eyebrow="Step 1 of 3 · Formulate" title="Compose your product." description="Name it, choose the ingredients and set their concentrations. The formula has to total exactly 100%." />

      {created ? (
        <Card className="mx-auto max-w-2xl">
          <CardBody className="space-y-5 p-8 text-center">
            <CheckCircle2 className="mx-auto h-10 w-10 text-sage" aria-hidden />
            <div>
              <p className="eyebrow">Saved</p>
              <h2 className="font-display text-3xl font-semibold">{created.name}</h2>
            </div>
            <ul className="mx-auto flex max-w-md flex-wrap justify-center gap-2 text-sm">
              {created.formulations[0]?.ingredients.map((l) => (
                <li key={l.ingredientId} className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1">{l.ingredient.name} <strong>{l.percentage}%</strong></li>
              ))}
            </ul>
            <div className="flex flex-wrap justify-center gap-3">
              <Button onClick={() => navigate(`/claims?product=${created.id}`)}>Create a claim<ArrowRight className="h-4 w-4" /></Button>
              <Button variant="secondary" onClick={startAnother}><Plus className="h-4 w-4" />Another product</Button>
            </div>
          </CardBody>
        </Card>
      ) : (
        <DndContext sensors={sensors} collisionDetection={closestCenter} onDragStart={onDragStart} onDragEnd={onDragEnd} onDragCancel={() => setDragging(null)}>
          <label className="mb-8 block max-w-3xl">
            <span className="eyebrow">Product name</span>
            <input
              value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Radiance Renewal Serum"
              className="mt-1 w-full border-0 border-b-2 border-slate-300 bg-transparent px-0 py-2 font-display text-3xl text-slate-900 placeholder:text-slate-300 focus:border-teal-700 focus:outline-none"
            />
          </label>

          <div className="grid gap-6 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <IngredientExplorer ingredients={ingredients.data?.items ?? []} loading={ingredients.loading} usedIds={usedIds} onAdd={(i) => addIngredient(i)} />
            <div className="space-y-4">
              <FormulationCanvas
                lines={lines} selectedId={selectedId} readOnly={false} onSelect={setSelectedId} onBalance={balanceFormula}
                onChange={(id, value) => setLines((cur) => cur.map((l) => (l.ingredient.id === id ? { ...l, percentage: value } : l)))}
                onRemove={(id) => { setLines((cur) => cur.filter((l) => l.ingredient.id !== id)); if (selectedId === id) setSelectedId(null); }}
              />
              {selected && (
                <p className="rounded-xl bg-slate-100 p-4 text-sm text-slate-700"><strong className="font-display text-base">{selected.name}</strong> · {humanize(selected.category)} · {selected.evidenceCount} linked study(ies). {selected.description}</p>
              )}
              {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</p>}
              <div className="flex justify-end">
                <Button size="md" loading={saving} disabled={!canSave} onClick={save} title={canSave ? undefined : 'Add a product name and make the formula total 100%'}>
                  <Save className="h-4 w-4" />Save product
                </Button>
              </div>
            </div>
          </div>
          <DragOverlay>{dragging && <div className="rounded-xl border border-teal-700 bg-white px-3 py-2 text-sm font-medium shadow-lg">{dragging.name}</div>}</DragOverlay>
        </DndContext>
      )}
    </>
  );
}

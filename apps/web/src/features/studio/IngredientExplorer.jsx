import { useDraggable } from '@dnd-kit/core';
import { GripVertical, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { VerificationBadge } from '@/components/badges';
import { Badge, Button, Input, Select, Skeleton } from '@/components/ui/primitives';
import { cn, humanize, INGREDIENT_CATEGORIES } from '@/lib/lib';

/** Draggable ingredient card. The Add button is the keyboard-accessible alternative to dragging. */
function IngredientCard({ ingredient, used, onAdd }) {
  const { attributes, listeners, setNodeRef, isDragging } = useDraggable({ id: `lib:${ingredient.id}`, disabled: used });
  return (
    <li ref={setNodeRef} className={cn('flex items-start gap-1.5 rounded-md border border-slate-200 bg-white p-2', isDragging && 'opacity-40', used && 'bg-slate-50 opacity-60')}>
      <button type="button" {...listeners} {...attributes} disabled={used} aria-label={`Drag ${ingredient.name} into the formulation`} className="mt-0.5 cursor-grab text-slate-400 hover:text-slate-700 disabled:cursor-not-allowed">
        <GripVertical className="h-4 w-4" aria-hidden />
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-slate-900">{ingredient.name}</p>
        <p className="truncate text-xs text-slate-500">{ingredient.primaryFunction}</p>
        <div className="mt-1 flex flex-wrap items-center gap-1">
          <Badge>{humanize(ingredient.category)}</Badge><VerificationBadge status={ingredient.status} />
          <span className="text-[11px] text-slate-500">{ingredient.evidenceCount} evidence</span>
        </div>
      </div>
      <Button size="icon" variant="secondary" disabled={used} onClick={() => onAdd(ingredient)} aria-label={`Add ${ingredient.name}`}><Plus className="h-4 w-4" /></Button>
    </li>
  );
}

export function IngredientExplorer({ ingredients, loading, usedIds, onAdd }) {
  const [q, setQ] = useState('');
  const [category, setCategory] = useState('');
  const visible = useMemo(
    () => ingredients.filter((i) => (!category || i.category === category) && (!q || `${i.name} ${i.inciName} ${i.primaryFunction}`.toLowerCase().includes(q.toLowerCase()))),
    [ingredients, q, category],
  );

  return (
    <section className="flex min-h-0 flex-col rounded-lg border border-slate-200 bg-white" aria-label="Ingredient explorer">
      <div className="space-y-2 border-b border-slate-100 p-3">
        <h2 className="text-sm font-semibold">Ingredient explorer</h2>
        <Input placeholder="Search ingredients" aria-label="Search ingredients" value={q} onChange={(e) => setQ(e.target.value)} />
        <Select aria-label="Filter by category" value={category} onChange={(e) => setCategory(e.target.value)}>
          <option value="">All categories</option>{INGREDIENT_CATEGORIES.map((c) => <option key={c} value={c}>{humanize(c)}</option>)}
        </Select>
      </div>
      <ul className="max-h-[28rem] flex-1 space-y-2 overflow-y-auto p-3 xl:max-h-[calc(100vh-15rem)]">
        {loading ? Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-16 w-full" />) : visible.length === 0 ? <li className="py-6 text-center text-sm text-slate-500">No ingredients match.</li> :
          visible.map((i) => <IngredientCard key={i.id} ingredient={i} used={usedIds.has(i.id)} onAdd={onAdd} />)}
      </ul>
    </section>
  );
}

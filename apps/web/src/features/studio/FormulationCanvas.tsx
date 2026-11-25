import { useDroppable } from '@dnd-kit/core';
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { AlertTriangle, CheckCircle2, GripVertical, Scale, Trash2 } from 'lucide-react';
import { Badge, Button, Input, Progress } from '@/components/ui/primitives';
import { cn, compositionOf, humanize } from '@/lib/lib';
import type { Ingredient } from '@/types';

export interface CanvasLine { ingredient: Ingredient; percentage: string }

function Row({ line, selected, readOnly, onSelect, onChange, onRemove }: {
  line: CanvasLine; selected: boolean; readOnly: boolean; onSelect: () => void; onChange: (value: string) => void; onRemove: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: `line:${line.ingredient.id}`, disabled: readOnly });
  const share = Math.max(0, Math.min(100, Number(line.percentage) || 0));
  return (
    <li ref={setNodeRef} style={{ transform: CSS.Transform.toString(transform), transition }} className={cn('rounded-md border bg-white p-2.5', selected ? 'border-teal-600 ring-1 ring-teal-600' : 'border-slate-200', isDragging && 'opacity-60')}>
      <div className="flex items-center gap-2">
        {!readOnly && <button type="button" {...listeners} {...attributes} className="cursor-grab text-slate-400 hover:text-slate-700" aria-label={`Reorder ${line.ingredient.name}`}><GripVertical className="h-4 w-4" aria-hidden /></button>}
        <button type="button" onClick={onSelect} className="min-w-0 flex-1 cursor-pointer text-left">
          <span className="block truncate text-sm font-medium text-slate-900">{line.ingredient.name}</span>
          <span className="block truncate text-xs text-slate-500">{line.ingredient.inciName} - {humanize(line.ingredient.category)}</span>
        </button>
        <div className="flex items-center gap-1">
          <Input type="number" inputMode="decimal" min="0" max="100" step="0.01" value={line.percentage} readOnly={readOnly} onChange={(e) => onChange(e.target.value)}
            onFocus={onSelect} aria-label={`${line.ingredient.name} concentration in percent`} className="h-8 w-24 text-right" />
          <span className="text-sm text-slate-500">%</span>
        </div>
        {!readOnly && <Button variant="ghost" size="icon" onClick={onRemove} aria-label={`Remove ${line.ingredient.name}`}><Trash2 className="h-4 w-4" /></Button>}
      </div>
      <div className="mt-2 h-1 rounded-full bg-slate-100"><div className="h-1 rounded-full bg-teal-600" style={{ width: `${share}%` }} /></div>
    </li>
  );
}

/** Droppable composition canvas with live percentage validation. */
export function FormulationCanvas({ lines, selectedId, readOnly, onSelect, onChange, onRemove, onBalance }: {
  lines: CanvasLine[]; selectedId: string | null; readOnly: boolean; onSelect: (id: string) => void;
  onChange: (id: string, value: string) => void; onRemove: (id: string) => void; onBalance: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: 'canvas' });
  const { total, remaining, status } = compositionOf(lines.map((l) => Number(l.percentage)));
  const tone = status === 'VALID' ? 'green' : status === 'OVER' ? 'red' : 'amber';
  const hasBase = lines.some((l) => l.ingredient.category === 'BASE');

  return (
    <section className="flex min-w-0 flex-col rounded-lg border border-slate-200 bg-white" aria-label="Formulation canvas">
      <div ref={setNodeRef} className={cn('min-h-64 flex-1 space-y-2 p-3 transition-colors', isOver && 'bg-teal-50/60')}>
        {lines.length === 0 ? (
          <div className="flex h-56 flex-col items-center justify-center rounded-md border-2 border-dashed border-slate-200 text-center text-sm text-slate-500">
            <p className="font-medium text-slate-700">Drop ingredients here</p>
            <p>or use the Add button on an ingredient card.</p>
          </div>
        ) : (
          <SortableContext items={lines.map((l) => `line:${l.ingredient.id}`)} strategy={verticalListSortingStrategy}>
            <ul className="space-y-2">
              {lines.map((line) => (
                <Row key={line.ingredient.id} line={line} readOnly={readOnly} selected={selectedId === line.ingredient.id} onSelect={() => onSelect(line.ingredient.id)}
                  onChange={(v) => onChange(line.ingredient.id, v)} onRemove={() => onRemove(line.ingredient.id)} />
              ))}
            </ul>
          </SortableContext>
        )}
      </div>

      {/* Composition meter */}
      <div className="space-y-2 border-t border-slate-100 bg-slate-50 p-3" aria-live="polite">
        <div className="flex flex-wrap items-center gap-3 text-sm">
          <span className="font-semibold text-slate-900">Total {total}%</span>
          <span className="text-slate-600">Remaining {remaining}%</span>
          <Badge tone={tone}>{status === 'VALID' ? <><CheckCircle2 className="h-3 w-3" aria-hidden />Valid: totals 100%</> : status === 'OVER' ? <><AlertTriangle className="h-3 w-3" aria-hidden />Over-allocated</> : status === 'UNDER' ? <><AlertTriangle className="h-3 w-3" aria-hidden />Under-allocated</> : 'Empty'}</Badge>
          {!readOnly && hasBase && status !== 'VALID' && lines.length > 1 && (
            <Button variant="secondary" size="sm" className="ml-auto" onClick={onBalance}><Scale className="h-4 w-4" />Balance with base</Button>
          )}
        </div>
        <Progress value={total} tone={status === 'VALID' ? 'green' : status === 'OVER' ? 'red' : 'amber'} />
        {status === 'OVER' && <p className="text-xs text-red-700">Over-allocation: reduce concentrations by {Math.abs(remaining)}% to submit.</p>}
        {status === 'UNDER' && lines.length > 0 && <p className="text-xs text-amber-800">Under-allocation: {remaining}% is unassigned. The formula must total exactly 100% before it can be finalised or assessed.</p>}
      </div>
    </section>
  );
}

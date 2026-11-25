// shadcn/ui-style primitives (Tailwind + Radix). Kept in one file so the whole UI kit is easy to scan.
import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as DropdownPrimitive from '@radix-ui/react-dropdown-menu';
import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { AlertTriangle, Inbox, Loader2, X } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes, type TdHTMLAttributes, type ThHTMLAttributes } from 'react';
import { cn } from '@/lib/lib';

// ───────── Button ─────────
const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-full text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 cursor-pointer',
  {
    variants: {
      variant: {
        primary: 'bg-teal-700 text-white shadow-sm hover:bg-teal-800',
        secondary: 'border border-slate-300 bg-white text-slate-800 hover:border-teal-700 hover:text-teal-800',
        ghost: 'text-slate-700 hover:bg-slate-100',
        danger: 'bg-red-600 text-white hover:bg-red-700',
      },
      size: { sm: 'h-8 px-4', md: 'h-10 px-6', icon: 'h-8 w-8' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, loading, children, disabled, ...props }, ref) => {
  const Comp = asChild ? Slot : 'button';
  return (
    <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} {...props}>
      {asChild ? children : <>{loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{children}</>}
    </Comp>
  );
});
Button.displayName = 'Button';

// ───────── Form controls ─────────
const controlClass = 'w-full rounded-xl border border-slate-300 bg-white px-3 text-sm text-slate-900 placeholder:text-slate-400 focus-visible:outline-2 focus-visible:outline-teal-600 disabled:bg-slate-100';
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...props }, ref) => (
  <input ref={ref} className={cn(controlClass, 'h-10', className)} {...props} />
));
Input.displayName = 'Input';
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...props }, ref) => (
  <textarea ref={ref} rows={3} className={cn(controlClass, 'py-2', className)} {...props} />
));
Textarea.displayName = 'Textarea';
/** Native <select> styled like shadcn Select: fully keyboard/screen-reader accessible with zero extra JS. */
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...props }, ref) => (
  <select ref={ref} className={cn(controlClass, 'h-10 pr-8', className)} {...props} />
));
Select.displayName = 'Select';

export function Field({ label, hint, error, children, className }: { label: string; hint?: string; error?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block space-y-1', className)}>
      <span className="text-xs font-medium text-slate-700">{label}</span>
      {children}
      {hint && !error && <span className="block text-xs text-slate-500">{hint}</span>}
      {error && <span className="block text-xs text-red-600">{error}</span>}
    </label>
  );
}

// ───────── Badge ─────────
const badgeVariants = cva('inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium whitespace-nowrap', {
  variants: {
    tone: {
      neutral: 'border-slate-200 bg-slate-100 text-slate-700',
      teal: 'border-teal-200 bg-teal-50 text-teal-800',
      green: 'border-emerald-200 bg-emerald-50 text-emerald-800',
      amber: 'border-amber-200 bg-amber-50 text-amber-800',
      red: 'border-red-200 bg-red-50 text-red-800',
      blue: 'border-sky-200 bg-sky-50 text-sky-800',
      violet: 'border-violet-200 bg-violet-50 text-violet-800',
    },
  },
  defaultVariants: { tone: 'neutral' },
});
export function Badge({ className, tone, ...props }: HTMLAttributes<HTMLSpanElement> & VariantProps<typeof badgeVariants>) {
  return <span className={cn(badgeVariants({ tone }), className)} {...props} />;
}

// ───────── Card ─────────
export const Card = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-2xl border border-slate-200 bg-white', className)} {...props} />
);
export const CardHeader = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3', className)} {...props} />
);
export const CardTitle = ({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) => (
  <h2 className={cn('font-display text-base font-semibold text-slate-900', className)} {...props} />
);
export const CardBody = ({ className, ...props }: HTMLAttributes<HTMLDivElement>) => <div className={cn('p-4', className)} {...props} />;

// ───────── Table ─────────
export const Table = ({ className, ...props }: HTMLAttributes<HTMLTableElement>) => (
  <div className="overflow-x-auto"><table className={cn('w-full text-left text-sm', className)} {...props} /></div>
);
export const Th = ({ className, ...props }: ThHTMLAttributes<HTMLTableCellElement>) => (
  <th className={cn('whitespace-nowrap border-b border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500', className)} {...props} />
);
export const Td = ({ className, ...props }: TdHTMLAttributes<HTMLTableCellElement>) => (
  <td className={cn('border-b border-slate-100 px-3 py-2.5 align-top text-slate-800', className)} {...props} />
);

// ───────── Dialog ─────────
export function Dialog({ open, onOpenChange, title, description, children, wide }: { open: boolean; onOpenChange: (open: boolean) => void; title: string; description?: string; children: ReactNode; wide?: boolean }) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-40 bg-slate-900/40" />
        <DialogPrimitive.Content
          className={cn('fixed left-1/2 top-1/2 z-50 flex max-h-[90vh] w-[calc(100vw-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col rounded-2xl border border-slate-200 bg-white shadow-lg', wide ? 'max-w-4xl' : 'max-w-xl')}
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-100 px-5 py-4">
            <div>
              <DialogPrimitive.Title className="font-display text-xl font-semibold text-slate-900">{title}</DialogPrimitive.Title>
              <DialogPrimitive.Description className={description ? 'mt-0.5 text-sm text-slate-500' : 'sr-only'}>{description ?? title}</DialogPrimitive.Description>
            </div>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" aria-label="Close"><X className="h-4 w-4" /></Button>
            </DialogPrimitive.Close>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export function ConfirmDialog({ open, onOpenChange, title, description, confirmLabel = 'Confirm', danger, loading, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; title: string; description: string; confirmLabel?: string; danger?: boolean; loading?: boolean; onConfirm: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange} title={title} description={description}>
      <div className="flex justify-end gap-2">
        <Button variant="secondary" onClick={() => onOpenChange(false)}>Cancel</Button>
        <Button variant={danger ? 'danger' : 'primary'} loading={loading} onClick={onConfirm}>{confirmLabel}</Button>
      </div>
    </Dialog>
  );
}

// ───────── Tabs ─────────
export const Tabs = TabsPrimitive.Root;
export const TabsList = ({ className, ...props }: TabsPrimitive.TabsListProps) => (
  <TabsPrimitive.List className={cn('inline-flex items-center gap-1 rounded-full bg-slate-100 p-1', className)} {...props} />
);
export const TabsTrigger = ({ className, ...props }: TabsPrimitive.TabsTriggerProps) => (
  <TabsPrimitive.Trigger
    className={cn('cursor-pointer rounded-full px-4 py-1 text-sm font-medium text-slate-600 data-[state=active]:bg-white data-[state=active]:text-slate-900 data-[state=active]:shadow-sm', className)}
    {...props}
  />
);
export const TabsContent = ({ className, ...props }: TabsPrimitive.TabsContentProps) => <TabsPrimitive.Content className={cn('mt-3', className)} {...props} />;

// ───────── Tooltip ─────────
export const TooltipProvider = TooltipPrimitive.Provider;
export function Tooltip({ content, children }: { content: ReactNode; children: ReactNode }) {
  return (
    <TooltipPrimitive.Root delayDuration={150}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content sideOffset={6} className="z-50 max-w-xs rounded-md bg-slate-900 px-3 py-2 text-xs text-white shadow">
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

// ───────── Dropdown menu ─────────
export const DropdownMenu = DropdownPrimitive.Root;
export const DropdownTrigger = DropdownPrimitive.Trigger;
export const DropdownContent = ({ className, ...props }: DropdownPrimitive.DropdownMenuContentProps) => (
  <DropdownPrimitive.Portal>
    <DropdownPrimitive.Content align="end" sideOffset={6} className={cn('z-50 min-w-48 rounded-md border border-slate-200 bg-white p-1 shadow-lg', className)} {...props} />
  </DropdownPrimitive.Portal>
);
export const DropdownItem = ({ className, ...props }: DropdownPrimitive.DropdownMenuItemProps) => (
  <DropdownPrimitive.Item className={cn('flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm text-slate-800 outline-none data-[highlighted]:bg-slate-100', className)} {...props} />
);

// ───────── Feedback states ─────────
export const Skeleton = ({ className }: { className?: string }) => <div className={cn('animate-pulse rounded bg-slate-200', className)} aria-hidden />;

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4" role="status" aria-label="Loading">
      {Array.from({ length: rows }).map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
    </div>
  );
}

export function EmptyState({ title, description, action }: { title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-4 py-10 text-center">
      <Inbox className="h-8 w-8 text-slate-300" aria-hidden />
      <p className="text-sm font-medium text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center gap-2 px-4 py-8 text-center" role="alert">
      <AlertTriangle className="h-7 w-7 text-red-500" aria-hidden />
      <p className="text-sm text-slate-700">{message}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>Retry</Button>}
    </div>
  );
}

export function Progress({ value, className, tone = 'teal' }: { value: number; className?: string; tone?: 'teal' | 'amber' | 'red' | 'green' }) {
  const color = { teal: 'bg-teal-700', amber: 'bg-amber-500', red: 'bg-red-500', green: 'bg-emerald-500' }[tone];
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-slate-200', className)} role="progressbar" aria-valuenow={Math.round(value)} aria-valuemin={0} aria-valuemax={100}>
      <div className={cn('h-full rounded-full transition-all', color)} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

/** Inline error banner for forms (shows server validation details). */
export function FormError({ message }: { message?: string | null }) {
  return message ? <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">{message}</p> : null;
}

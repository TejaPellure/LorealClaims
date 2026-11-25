---
name: frontend-design
description: Visual system, component conventions, responsive layout, interaction patterns and accessibility rules for the Claims Intelligence Engine React UI. Use when creating or restyling pages and components in apps/web.
---

# Frontend design system

**Direction:** Clinical Research Workspace + Modern AI Laboratory. Calm, dense, scientific. Not a generic admin dashboard.

## Visual tokens
- Surfaces: white cards on `slate-50` page, `slate-200` 1px borders, shadows only on dialogs.
- Text: `slate-900` headings, `slate-600/500` secondary. Accent: `teal-700` (primary actions, active nav). Status colours only for meaning: emerald (good), amber (caution), red (problem), violet (demo/mock), sky (in progress).
- Font: Inter with system fallbacks. Headings `text-xl` max on pages, `text-sm font-semibold` in cards. Card radius 8px.
- Never: gradients, glassmorphism, neon, emoji icons, large empty hero areas, decorative animation.

## Components (`components/ui/primitives.tsx`)
Button, Input, Textarea, Select (native, styled), Field, Badge, Card, Table (Th/Td), Dialog, ConfirmDialog, Tabs, Tooltip, DropdownMenu, Skeleton, TableSkeleton, EmptyState, ErrorState, Progress, FormError. Toasts via `sonner`. Reuse these before adding anything new. Domain badges live in `components/badges.tsx`.

## Layout
App shell: left sidebar (collapses under `lg` into a drawer), top bar with breadcrumb, search, mock/Claude indicator, notifications placeholder, demo persona selector, profile menu. Formulation Studio: `lg` two columns, `xl` three panels (explorer | canvas | properties). Must stay usable at tablet width (768px).

## Interaction
- Every data view: loading skeleton, error with retry, empty state with guidance.
- Forms: labelled fields, HTML validation, server error text via `errorText()` in `FormError`.
- Drag and drop (`@dnd-kit`) always has a keyboard/button alternative. Final/locked states are explained in text.
- Mock AI results always show the "Demo / Mock AI" badge; illustrative formulas and demo evidence are always labelled.

## Accessibility
Visible focus ring (global), `aria-label` on icon buttons, table rows with `tabIndex` + Enter, `aria-live` for the composition meter, colour never the only signal (badges carry text).

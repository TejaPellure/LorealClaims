---
name: frontend-design
description: Brand visual system, component conventions, layout and accessibility rules for the Claims Intelligence React UI. Use when creating or restyling pages and components in apps/web.
---

# Frontend design system

**Direction:** a cosmetic-science brand, editorial and calm. Not an admin dashboard.

## Tokens (defined in `src/index.css`)
- Surfaces: ivory page (`slate-50`), white cards, warm hairline borders (`slate-200`). Ink: aubergine (`slate-900`). Brand: deep plum (`teal-700`, hover `teal-800`). Status colours only for meaning: sage (supported), clay (inconclusive), brick (not supported).
- Type: Playfair Display (`font-display`) for titles and numbers, Inter for UI. Page titles `text-4xl/5xl`; small uppercase `.eyebrow` labels above headings (e.g. "Step 1 of 3 · Formulate").
- Shape: pill buttons and badges, `rounded-xl` inputs, `rounded-2xl` cards, verdict hero `rounded-3xl`.
- Never: gradients, glassmorphism, neon, emoji icons, admin sidebars, decorative animation.

## Layout
Top bar only: wordmark + four destinations (Formulate, Claims, Ingredients, Evidence). Centered content, max width 7xl. Three numbered steps guide the main flow. Studio: ingredient picker left, canvas right, one Save.

## Components (`components/ui/primitives.tsx`)
Button, Input, Textarea, Select (native), Field, Badge, Card, Table, Dialog, Tabs, Tooltip, Skeleton, EmptyState, ErrorState, Progress, FormError. Toasts via `sonner`. Reuse before adding.

## Interaction and accessibility
Every data view has loading, error (with retry) and empty states. Long operations (Claude evaluation, about 1-2 minutes) show a clear in-progress state and keep the claim if they fail. Drag and drop always has a button alternative. Visible focus rings, labelled inputs, `aria-live` on the composition meter and evaluation progress, `prefers-reduced-motion` respected, colour never the only signal.

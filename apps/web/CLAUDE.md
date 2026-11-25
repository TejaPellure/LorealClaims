# apps/web guidance

- Pages in `pages/` (route-level), feature components in `features/<area>/`, generic UI in `components/ui/primitives.tsx` (shadcn-style), domain badges in `components/badges.tsx`.
- Data: `useAsync(() => api.get(...), deps)`; forms: `useFormState`. No global state library.
- Always render loading (`Skeleton`/`TableSkeleton`), error (`ErrorState` with retry) and empty (`EmptyState`) states.
- Visual rules: white surfaces, `slate` text, restrained `teal` accent, 1px borders, no gradients/glass/emoji. Icons from `lucide-react` only. Tables for scientific data.
- Accessibility: every control has a label, drag actions have a button alternative, dialogs use Radix, keep visible focus rings.
- A mock result must always show the **Demo / Mock AI** badge (`ProviderBadge`). Illustrative formulas show `BasisBadge`; DEMO evidence shows the "Demo data" badge.
- Percentage validation in `lib/lib.ts#compositionOf` mirrors the server (integer math at 1e-4). The server stays authoritative.

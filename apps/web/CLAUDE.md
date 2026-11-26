# apps/web guidance

- The frontend is plain JavaScript with JSX (`.jsx` components, `.js` modules), not TypeScript. Do not add `.tsx` files or a tsconfig.
- Pages in `pages/`, feature components in `features/<area>/`, UI kit in `components/ui/primitives.jsx` (shadcn-style, Radix), domain badges in `components/badges.jsx`.
- Data: `useAsync(() => api.get(...), deps)`; forms: plain state or `useFormState`. No global state library.
- Always render loading (`Skeleton`), error (`ErrorState` with retry) and empty (`EmptyState`) states.
- Brand look: ivory surfaces, aubergine ink, plum brand colour, Playfair Display headings (`font-display`) with Inter UI text, pill buttons, `eyebrow` labels, generous whitespace. The slate/teal Tailwind scales are remapped to the brand palette in `index.css`, so `text-slate-*` and `bg-teal-*` are on-brand. Icons: `lucide-react` only. No gradients, glass, emoji.
- Keep forms short. If the server can derive a value, do not ask for it.
- Percentage validation in `lib/lib.js#compositionOf` mirrors the server (integer math at 1e-4). The server stays authoritative.

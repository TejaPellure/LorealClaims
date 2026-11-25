import { Hexagon } from 'lucide-react';
import { Link, NavLink, Outlet } from 'react-router-dom';
import { cn } from '@/lib/lib';

const NAV = [
  { to: '/', label: 'Formulate', end: true },
  { to: '/claims', label: 'Claims' },
  { to: '/ingredients', label: 'Ingredients' },
  { to: '/evidence', label: 'Evidence' },
];

/** Brand shell: wordmark on the left, four plain destinations on the right. No sidebar, no admin chrome. */
export default function AppLayout() {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-slate-200/80 bg-slate-50/90 backdrop-blur">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-5 py-3 sm:px-8">
          <Link to="/" className="flex items-center gap-2.5" aria-label="Claims Intelligence home">
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-teal-700 text-white"><Hexagon className="h-4.5 w-4.5" aria-hidden /></span>
            <span className="font-display text-xl font-semibold tracking-tight text-slate-900">Claims <em className="font-medium text-teal-700">Intelligence</em></span>
          </Link>
          <nav aria-label="Main" className="flex items-center gap-1">
            {NAV.map(({ to, label, end }) => (
              <NavLink
                key={to} to={to} end={end}
                className={({ isActive }) => cn('rounded-full px-4 py-2 text-sm font-medium transition-colors', isActive ? 'bg-teal-700 text-white' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')}
              >
                {label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>
      <main className="mx-auto w-full max-w-7xl flex-1 px-5 py-10 sm:px-8"><Outlet /></main>
      <footer className="border-t border-slate-200 py-6 text-center text-xs text-slate-500">
        Evidence-based decision support. Assessments assist scientific evaluators and are not regulatory approval.
      </footer>
    </div>
  );
}

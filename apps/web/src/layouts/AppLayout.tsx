import { Activity, BookOpen, FlaskConical, History, LayoutDashboard, Bell, Search, ShieldCheck, FileSearch, UserCircle2, Menu } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { ProviderBadge } from '@/components/badges';
import { Button, DropdownContent, DropdownItem, DropdownMenu, DropdownTrigger, Input, Select } from '@/components/ui/primitives';
import { useAssessmentMeta, usePersona } from '@/hooks/hooks';
import { cn, PERSONAS } from '@/lib/lib';
import type { Persona } from '@/types';

const NAV = [
  { to: '/', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/ingredients', label: 'Ingredient Library', icon: BookOpen },
  { to: '/evidence', label: 'Evidence Library', icon: FileSearch },
  { to: '/studio', label: 'Formulation Studio', icon: FlaskConical },
  { to: '/claims', label: 'Claims Assessment', icon: ShieldCheck },
  { to: '/history', label: 'Assessment History', icon: History },
];

const TITLES: Record<string, string> = {
  '': 'Dashboard', ingredients: 'Ingredient Library', evidence: 'Evidence Library', studio: 'Formulation Studio',
  claims: 'Claims Assessment', history: 'Assessment History', assessments: 'Assessment Report',
};

export default function AppLayout() {
  const [menuOpen, setMenuOpen] = useState(false);
  const { persona, setPersona } = usePersona();
  const { data: meta } = useAssessmentMeta();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const segments = pathname.split('/').filter(Boolean);
  const title = TITLES[segments[0] ?? ''] ?? 'Claims Intelligence Engine';

  // Global search: jumps to the evidence library with the query (the most useful searchable list).
  const submitSearch = (event: FormEvent) => {
    event.preventDefault();
    if (search.trim()) navigate(`/evidence?q=${encodeURIComponent(search.trim())}`);
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className={cn('fixed inset-y-0 left-0 z-30 w-56 shrink-0 border-r border-slate-200 bg-white transition-transform lg:static lg:translate-x-0', menuOpen ? 'translate-x-0' : '-translate-x-full')}>
        <Link to="/" className="flex h-14 items-center gap-2 border-b border-slate-100 px-4">
          <span className="flex h-7 w-7 items-center justify-center rounded-md bg-teal-700 text-white"><Activity className="h-4 w-4" aria-hidden /></span>
          <span className="text-sm font-semibold leading-tight text-slate-900">Claims Intelligence<br /><span className="font-normal text-slate-500">Engine</span></span>
        </Link>
        <nav className="space-y-0.5 p-2" aria-label="Main">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to} to={to} end={end} onClick={() => setMenuOpen(false)}
              className={({ isActive }) => cn('flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium', isActive ? 'bg-teal-50 text-teal-800' : 'text-slate-600 hover:bg-slate-100')}
            >
              <Icon className="h-4 w-4" aria-hidden />{label}
            </NavLink>
          ))}
        </nav>
        <p className="absolute inset-x-0 bottom-0 border-t border-slate-100 p-3 text-[11px] leading-snug text-slate-500">
          Decision-support prototype. AI output assists scientific evaluators and is never regulatory approval.
        </p>
      </aside>
      {menuOpen && <div className="fixed inset-0 z-20 bg-slate-900/30 lg:hidden" onClick={() => setMenuOpen(false)} aria-hidden />}

      <div className="flex min-w-0 flex-1 flex-col">
        {/* Top bar */}
        <header className="sticky top-0 z-10 flex h-14 items-center gap-3 border-b border-slate-200 bg-white px-4">
          <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation" onClick={() => setMenuOpen(true)}><Menu className="h-4 w-4" /></Button>
          <nav aria-label="Breadcrumb" className="min-w-0 text-sm">
            <span className="text-slate-400">Workspace / </span><span className="font-semibold text-slate-900">{title}</span>
            {segments[1] && <span className="text-slate-400"> / Detail</span>}
          </nav>
          <form onSubmit={submitSearch} className="ml-auto hidden w-64 md:block" role="search">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-slate-400" aria-hidden />
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search evidence..." aria-label="Global search" className="pl-8" />
            </div>
          </form>
          {meta && <div className="hidden sm:block"><ProviderBadge provider={meta.provider} /></div>}
          <Button variant="ghost" size="icon" aria-label="Notifications (placeholder)" title="Notifications (placeholder)"><Bell className="h-4 w-4" /></Button>
          <label className="flex items-center gap-1.5 text-xs text-slate-500">
            <span className="hidden lg:inline">Demo persona</span>
            <Select value={persona} onChange={(e) => setPersona(e.target.value as Persona)} className="h-8 w-40 text-xs" aria-label="Demo persona (not authentication)">
              {PERSONAS.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </Select>
          </label>
          <DropdownMenu>
            <DropdownTrigger asChild><Button variant="ghost" size="icon" aria-label="User profile"><UserCircle2 className="h-5 w-5" /></Button></DropdownTrigger>
            <DropdownContent>
              <div className="px-2 py-1.5 text-xs text-slate-500">Signed in as demo persona<br /><strong className="text-slate-800">{PERSONAS.find((p) => p.value === persona)?.label}</strong></div>
              <DropdownItem disabled>No authentication in this prototype</DropdownItem>
            </DropdownContent>
          </DropdownMenu>
        </header>
        <main className="min-w-0 flex-1 p-4 lg:p-6"><Outlet /></main>
      </div>
    </div>
  );
}

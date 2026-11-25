import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { api, errorText, getPersona, setPersona as storePersona } from '@/services/api';
import type { AssessmentMeta, Persona } from '@/types';

/** Loads data on mount / when deps change, with loading + error state and a manual reload. */
export function useAsync<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: true });
  const [tick, setTick] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;

  useEffect(() => {
    let cancelled = false;
    setState((s) => ({ ...s, loading: true, error: null }));
    loadRef.current()
      .then((data) => !cancelled && setState({ data, error: null, loading: false }))
      .catch((e) => !cancelled && setState((s) => ({ data: s.data, error: errorText(e), loading: false })));
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);

  return { ...state, reload: useCallback(() => setTick((t) => t + 1), []) };
}

export function useDebounced<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Tiny controlled-form helper: `const { values, bind, set } = useFormState(initial)`. */
export function useFormState<T extends Record<string, unknown>>(initial: T) {
  const [values, setValues] = useState<T>(initial);
  const set = <K extends keyof T>(key: K, value: T[K]) => setValues((v) => ({ ...v, [key]: value }));
  const bind = (key: keyof T) => ({
    value: (values[key] ?? '') as string | number,
    onChange: (e: { target: { value: string } }) => set(key, e.target.value as T[keyof T]),
  });
  return { values, set, bind, reset: (next: T = initial) => setValues(next) };
}

// ── Demo persona (NOT authentication; see docs/BUSINESS_WORKFLOW.md) ──
interface PersonaContextValue { persona: Persona; setPersona: (p: Persona) => void }
const PersonaContext = createContext<PersonaContextValue>({ persona: 'SCIENTIST', setPersona: () => undefined });

export function PersonaProvider({ children }: { children: ReactNode }) {
  const [persona, setState] = useState<Persona>(getPersona());
  const setPersona = (p: Persona) => {
    storePersona(p);
    setState(p);
  };
  return <PersonaContext.Provider value={{ persona, setPersona }}>{children}</PersonaContext.Provider>;
}
export const usePersona = () => useContext(PersonaContext);

/** Active assessment provider (mock vs Claude), used for the Demo/Mock AI indicator. */
export function useAssessmentMeta() {
  return useAsync(() => api.get<AssessmentMeta>('/assessments/meta'), []);
}

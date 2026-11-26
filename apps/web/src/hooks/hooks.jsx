import { useCallback, useEffect, useRef, useState } from 'react';
import { errorText } from '@/services/api';

/** Loads data on mount / when deps change, with loading + error state and a manual reload. */
export function useAsync(load, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
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

export function useDebounced(value, delayMs = 300) {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

/** Tiny controlled-form helper: `const { values, bind, set } = useFormState(initial)`. */
export function useFormState(initial) {
  const [values, setValues] = useState(initial);
  const set = (key, value) => setValues((v) => ({ ...v, [key]: value }));
  const bind = (key) => ({
    value: (values[key] ?? '') ,
    onChange: (e) => set(key, e.target.value ),
  });
  return { values, set, bind, reset: (next = initial) => setValues(next) };
}

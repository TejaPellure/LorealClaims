// Central API layer. Same-origin URLs only: in production NestJS serves both the SPA and /api,
// in development Vite proxies /api. No secrets or provider details ever reach the browser.
import type { Persona } from '@/types';

const BASE = '/api';
const PERSONA_KEY = 'cie.persona';

export const getPersona = (): Persona => (localStorage.getItem(PERSONA_KEY) as Persona) || 'SCIENTIST';
export const setPersona = (persona: Persona) => localStorage.setItem(PERSONA_KEY, persona);

export class ApiError extends Error {
  constructor(message: string, public status: number, public details: string[] = []) {
    super(message);
  }
}

type Query = Record<string, string | number | boolean | undefined | null>;

function toUrl(path: string, query?: Query) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && params.set(k, String(v)));
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function request<T>(path: string, init: RequestInit = {}, query?: Query): Promise<T> {
  let response: Response;
  try {
    response = await fetch(toUrl(path, query), {
      ...init,
      headers: {
        ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
        'x-demo-persona': getPersona(), // demo label only, not authentication
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the application is running.', 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const details: string[] = Array.isArray(body?.details) ? body.details.map(String) : [];
    throw new ApiError(body?.message ?? `Request failed (${response.status})`, response.status, details);
  }
  return response.status === 204 ? (undefined as T) : ((await response.json()) as T);
}

export const api = {
  get: <T>(path: string, query?: Query) => request<T>(path, {}, query),
  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: <T>(path: string, body: unknown) => request<T>(path, { method: 'PATCH', body: JSON.stringify(body) }),
  upload: <T>(path: string, file: File) => {
    const form = new FormData();
    form.append('file', file);
    return request<T>(path, { method: 'POST', body: form });
  },
  downloadUrl: (evidenceId: string) => `${BASE}/evidence/${evidenceId}/download`,
};

/** Human-readable text for toasts and inline errors. */
export function errorText(error: unknown): string {
  if (error instanceof ApiError) return error.details.length ? `${error.message} ${error.details.join(' ')}` : error.message;
  return error instanceof Error ? error.message : 'Something went wrong.';
}

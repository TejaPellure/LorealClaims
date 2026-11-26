// Central API layer. Same-origin URLs only: in production NestJS serves both the SPA and /api,
// in development Vite proxies /api. No secrets or provider details ever reach the browser.

const BASE = '/api';
export class ApiError extends Error {
  constructor(message,  status,  details = []) {
    super(message);this.status = status;this.details = details;;
  }
}

function toUrl(path, query) {
  const params = new URLSearchParams();
  Object.entries(query ?? {}).forEach(([k, v]) => v !== undefined && v !== null && v !== '' && params.set(k, String(v)));
  const qs = params.toString();
  return `${BASE}${path}${qs ? `?${qs}` : ''}`;
}

async function request(path, init = {}, query) {
  let response;
  try {
    response = await fetch(toUrl(path, query), {
      ...init,
      headers: {
        ...(init.body && !(init.body instanceof FormData) ? { 'content-type': 'application/json' } : {}),
        ...init.headers,
      },
    });
  } catch {
    throw new ApiError('Cannot reach the server. Check that the application is running.', 0);
  }
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const details = Array.isArray(body?.details) ? body.details.map(String) : [];
    throw new ApiError(body?.message ?? `Request failed (${response.status})`, response.status, details);
  }
  return response.status === 204 ? (undefined ) : ((await response.json()) );
}

export const api = {
  get: (path, query) => request(path, {}, query),
  post: (path, body) => request(path, { method: 'POST', body: JSON.stringify(body ?? {}) }),
  patch: (path, body) => request(path, { method: 'PATCH', body: JSON.stringify(body) }),
  upload: (path, file) => {
    const form = new FormData();
    form.append('file', file);
    return request(path, { method: 'POST', body: form });
  },
  downloadUrl: (evidenceId) => `${BASE}/evidence/${evidenceId}/download`,
};

/** Human-readable text for toasts and inline errors. */
export function errorText(error) {
  if (error instanceof ApiError) return error.details.length ? `${error.message} ${error.details.join(' ')}` : error.message;
  return error instanceof Error ? error.message : 'Something went wrong.';
}

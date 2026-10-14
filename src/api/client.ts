export class ApiError extends Error {
  constructor(public status: number, public code: string, message: string, public fields?: Record<string, string[]>, public requestId?: string) {
    super(message);
    this.name = 'ApiError';
  }
}

/** getAccessToken/refresh THROW on transient errors (→ NETWORK ApiError, session kept); refresh null = invalid session. */
export type TokenProvider = {
  getAccessToken(): Promise<string | null>;
  refresh(): Promise<string | null>;
  onAuthFailure(): void;
};

let provider: TokenProvider | null = null;
let refreshing: Promise<string | null> | null = null;
let failedFor: string | null = null;

export function setTokenProvider(p: TokenProvider | null) { provider = p; refreshing = null; failedFor = null; }

/** One refresh in flight at a time, shared by every parallel 401. */
const refreshOnce = () => (refreshing ??= provider!.refresh().finally(() => { refreshing = null; }));

const networkError = () => new ApiError(0, 'NETWORK', 'Network error');
/** A thrown token/refresh call is transient ("could not refresh now"): surface NETWORK, never sign out. */
const orNetwork = <T>(p: Promise<T>): Promise<T> => p.catch(() => { throw networkError(); });

const base = () => (import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '');

function qs(query?: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(query ?? {})) if (v !== undefined && v !== '') p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export async function request<T>(method: string, path: string, opts: { query?: Record<string, string | undefined>; body?: unknown } = {}): Promise<T> {
  const url = `${base()}/v1${path}${qs(opts.query)}`;
  const send = async (token: string | null): Promise<Response> => {
    const headers: Record<string, string> = {};
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (token) headers.Authorization = `Bearer ${token}`;
    try {
      return await fetch(url, { method, headers, body: opts.body === undefined ? undefined : JSON.stringify(opts.body) });
    } catch {
      throw networkError();
    }
  };

  const used = provider ? await orNetwork(provider.getAccessToken()) : null;
  let res = await send(used);
  if (res.status === 401 && provider && !(used !== null && used === failedFor)) {
    // A refresh may already have completed while this request was in flight.
    const current = await orNetwork(provider.getAccessToken());
    const fresh = current && current !== used ? current : await orNetwork(refreshOnce());
    if (fresh) res = await send(fresh);
    if (!fresh || res.status === 401) {
      const failed = fresh ?? used;
      if (failed === null || failed !== failedFor) {
        failedFor = failed;
        provider.onAuthFailure();
      }
    }
  }
  if (res.status === 204) return undefined as T;
  const text = await res.text();
  let data: { error?: { code?: string; message?: string; fields?: Record<string, string[]>; requestId?: string } } | undefined;
  try { data = text ? JSON.parse(text) : undefined; } catch { data = undefined; }
  if (!res.ok) {
    throw new ApiError(res.status, data?.error?.code ?? (res.status === 401 ? 'UNAUTHENTICATED' : 'INTERNAL'),
      data?.error?.message ?? res.statusText, data?.error?.fields, data?.error?.requestId);
  }
  return data as T;
}

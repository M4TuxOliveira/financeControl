import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError, request, setTokenProvider } from '../../src/api/client';

const json = (status: number, body?: unknown) => new Response(body === undefined ? null : JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
let fetchMock: ReturnType<typeof vi.fn>;

beforeEach(() => { fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock); setTokenProvider(null); });
afterEach(() => vi.unstubAllGlobals());

describe('request', () => {
  it('sends method, bearer token, JSON body and query to /v1', async () => {
    setTokenProvider({ getAccessToken: async () => 'tok', refresh: async () => null, onAuthFailure: vi.fn() });
    fetchMock.mockResolvedValue(json(200, { ok: 1 }));
    const r = await request<{ ok: number }>('POST', '/accounts', { body: { a: 1 }, query: { month: '2026-10', skip: undefined } });
    expect(r).toEqual({ ok: 1 });
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toMatch(/\/v1\/accounts\?month=2026-10$/);
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('Bearer tok');
    expect(init.headers['content-type']).toBe('application/json');
    expect(init.body).toBe('{"a":1}');
  });
  it('204 returns undefined', async () => {
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
    expect(await request('DELETE', '/accounts/1')).toBeUndefined();
  });
  it('maps API errors to ApiError with code, fields and requestId', async () => {
    fetchMock.mockResolvedValue(json(409, { error: { code: 'BUDGET_EXISTS', message: 'dup', fields: { a: ['x'] }, requestId: 'r1' } }));
    const err = await request('POST', '/budgets').catch(e => e);
    expect(err).toBeInstanceOf(ApiError);
    expect(err).toMatchObject({ status: 409, code: 'BUDGET_EXISTS', fields: { a: ['x'] }, requestId: 'r1' });
  });
  it('maps network failures to code NETWORK', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(request('GET', '/me')).rejects.toMatchObject({ status: 0, code: 'NETWORK' });
  });
  it('non-JSON error bodies still produce an ApiError', async () => {
    fetchMock.mockResolvedValue(new Response('<html>', { status: 502 }));
    await expect(request('GET', '/me')).rejects.toMatchObject({ status: 502, code: 'INTERNAL' });
  });
});

describe('401 handling (review focus 3)', () => {
  it('refreshes once and retries with the new token', async () => {
    const onAuthFailure = vi.fn();
    setTokenProvider({ getAccessToken: async () => 'old', refresh: async () => 'new', onAuthFailure });
    fetchMock.mockResolvedValueOnce(json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })).mockResolvedValueOnce(json(200, { ok: true }));
    expect(await request('GET', '/me')).toEqual({ ok: true });
    expect(fetchMock.mock.calls[1][1].headers.Authorization).toBe('Bearer new');
    expect(onAuthFailure).not.toHaveBeenCalled();
  });
  it('parallel 401s trigger exactly one refresh', async () => {
    const refresh = vi.fn(async () => { await new Promise(r => setTimeout(r, 10)); return 'new'; });
    setTokenProvider({ getAccessToken: async () => 'old', refresh, onAuthFailure: vi.fn() });
    fetchMock.mockImplementation(async (_u, init) => (init.headers.Authorization === 'Bearer new' ? json(200, { ok: true }) : json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } })));
    const rs = await Promise.all([request('GET', '/a'), request('GET', '/b'), request('GET', '/c')]);
    expect(rs).toEqual([{ ok: true }, { ok: true }, { ok: true }]);
    expect(refresh).toHaveBeenCalledTimes(1);
  });
  it('failed refresh signs out and rejects with UNAUTHENTICATED', async () => {
    const onAuthFailure = vi.fn();
    setTokenProvider({ getAccessToken: async () => 'old', refresh: async () => null, onAuthFailure });
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }));
    await expect(request('GET', '/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHENTICATED' });
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });
  it('a still-401 after a successful refresh also signs out (no retry loop)', async () => {
    const onAuthFailure = vi.fn();
    setTokenProvider({ getAccessToken: async () => 'old', refresh: async () => 'new', onAuthFailure });
    fetchMock.mockResolvedValue(json(401, { error: { code: 'UNAUTHENTICATED', message: 'x' } }));
    await expect(request('GET', '/me')).rejects.toMatchObject({ status: 401 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(onAuthFailure).toHaveBeenCalledTimes(1);
  });
});

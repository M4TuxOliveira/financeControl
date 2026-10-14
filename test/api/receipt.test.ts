import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as api from '../../src/api/endpoints';
import { uploadReceipt } from '../../src/api/receipt';

vi.mock('../../src/api/endpoints');
let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => { vi.mocked(api.issueReceipt).mockReset(); fetchMock = vi.fn(async () => new Response(null, { status: 204 })); vi.stubGlobal('fetch', fetchMock); });
afterEach(() => vi.unstubAllGlobals());

describe('uploadReceipt', () => {
  it('requests a presigned POST and uploads fields first, file last', async () => {
    vi.mocked(api.issueReceipt).mockResolvedValue({ key: 'k', upload: { url: 'https://s3.test/b', fields: { key: 'k', 'Content-Type': 'image/png' } } });
    const file = new File(['x'], 'r.png', { type: 'image/png' });
    await uploadReceipt('tx1', file);
    expect(api.issueReceipt).toHaveBeenCalledWith('tx1', 'image/png');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://s3.test/b');
    expect(init.method).toBe('POST');
    const keys = [...(init.body as FormData).keys()];
    expect(keys).toEqual(['key', 'Content-Type', 'file']);
  });
  it('rejects unsupported types and files over 5 MB before any request', async () => {
    await expect(uploadReceipt('t', new File(['x'], 'a.pdf', { type: 'application/pdf' }))).rejects.toThrow(/type/i);
    await expect(uploadReceipt('t', new File([new Uint8Array(5 * 1024 * 1024 + 1)], 'a.png', { type: 'image/png' }))).rejects.toThrow(/large/i);
    expect(api.issueReceipt).not.toHaveBeenCalled();
  });
  it('throws when S3 refuses the upload', async () => {
    vi.mocked(api.issueReceipt).mockResolvedValue({ key: 'k', upload: { url: 'https://s3.test/b', fields: {} } });
    fetchMock.mockResolvedValue(new Response('denied', { status: 403 }));
    await expect(uploadReceipt('t', new File(['x'], 'a.png', { type: 'image/png' }))).rejects.toThrow();
  });
});

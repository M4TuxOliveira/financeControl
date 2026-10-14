import { issueReceipt } from './endpoints';

const TYPES = ['image/jpeg', 'image/png', 'image/webp'];
const MAX = 5 * 1024 * 1024;

/** Presigned-POST upload: form fields first, the file last (S3 requirement). */
export async function uploadReceipt(txId: string, file: File): Promise<void> {
  if (!TYPES.includes(file.type)) throw new Error('Unsupported file type');
  if (file.size > MAX) throw new Error('File is too large (max 5 MB)');
  const { upload } = await issueReceipt(txId, file.type);
  const form = new FormData();
  for (const [k, v] of Object.entries(upload.fields)) form.append(k, v);
  form.append('file', file);
  const res = await fetch(upload.url, { method: 'POST', body: form });
  if (!res.ok) throw new Error(`Receipt upload failed (${res.status})`);
}

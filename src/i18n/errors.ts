import { hasKey, type I18n } from './index';

/** Translated, user-facing text for any thrown value. Unknown codes fall back to a generic message with the request id. */
export function errorMessage(err: unknown, t: I18n['t']): string {
  const e = err as { code?: unknown; requestId?: unknown } | null;
  const code = e && typeof e === 'object' && typeof e.code === 'string' ? e.code : undefined;
  const key = `errors.${code}`;
  if (code && hasKey(key)) return t(key);
  const id = e && typeof e.requestId === 'string' ? e.requestId : '-';
  return t('errors.generic', { id });
}

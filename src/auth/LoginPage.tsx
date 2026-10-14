import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import type { Key } from '../i18n/en';
import { Field } from '../ui';
import { useAuth } from './AuthProvider';

/** Cognito / backend sign-in error → catalog key. Matches on name/code AND message (Cognito reuses codes). */
function loginErrorKey(e: unknown): Key {
  const x = e as { name?: string; code?: string; message?: string } | null;
  const msg = x?.message ?? '';
  const has = (k: string) => [msg, x?.name, x?.code].includes(k);
  if (has('CONFIG')) return 'auth.configMissing';
  if (has('INVALID_DEV_ID')) return 'auth.invalidDevId';
  if (has('UNSUPPORTED_CHALLENGE')) return 'auth.unsupportedChallenge';
  if (has('NotAuthorizedException')) {
    if (/disabled/i.test(msg)) return 'auth.userDisabled';
    if (/attempts exceeded/i.test(msg)) return 'auth.tooManyAttempts';
    if (/temporary password has expired/i.test(msg)) return 'auth.tempPasswordExpired';
    return 'auth.invalidCredentials';
  }
  if (has('UserNotFoundException')) return 'auth.invalidCredentials';
  if (has('TooManyRequestsException') || has('LimitExceededException')) return 'auth.tooManyAttempts';
  if (has('PasswordResetRequiredException') || has('UserNotConfirmedException')) return 'auth.accountNotReady';
  if (has('InvalidPasswordException')) return 'auth.passwordPolicy';
  if (has('NetworkError') || e instanceof TypeError || x?.name === 'TypeError' || /failed to fetch|network ?error/i.test(msg)) return 'errors.NETWORK';
  return 'auth.genericError';
}

export function LoginPage() {
  const { t } = useI18n();
  const auth = useAuth();
  const [id, setId] = useState(auth.devMode ? 'dev' : '');
  const [secret, setSecret] = useState('');
  const [newPw, setNewPw] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true); setError('');
    try { await fn(); } catch (e) { setError(t(loginErrorKey(e))); } finally { setBusy(false); }
  };
  const submit = (e: FormEvent) => { e.preventDefault(); void run(() => auth.signIn(id, auth.devMode ? undefined : secret)); };
  const submitNew = (e: FormEvent) => { e.preventDefault(); void run(() => auth.completeNewPassword(newPw)); };

  return (
    <main className="login">
      {auth.devMode && <div className="banner" role="note">{t('auth.devBanner')}</div>}
      <div className="login-card card">
        <span className="brand"><b>financeControl</b><span className="pro">PRO</span></span>
        {auth.expired && <p className="muted" role="status">{t('auth.sessionExpired')}</p>}
        {auth.status === 'newPassword' ? (
          <form onSubmit={submitNew} className="login-form">
            <h1>{t('auth.newPasswordTitle')}</h1>
            <p className="muted">{t('auth.newPasswordHint')}</p>
            <Field label={t('auth.newPassword')}>{fid => <input id={fid} type="password" autoComplete="new-password" value={newPw} onChange={e => setNewPw(e.target.value)} />}</Field>
            {error && <span className="err" role="alert">{error}</span>}
            <button type="submit" className="btn btn-1" disabled={busy || !newPw}>{t('auth.setPassword')}</button>
          </form>
        ) : auth.devMode ? (
          <form onSubmit={submit} className="login-form">
            <h1>{t('auth.devTitle')}</h1>
            <Field label={t('auth.devUserId')}>{fid => <input id={fid} value={id} onChange={e => setId(e.target.value)} />}</Field>
            {error && <span className="err" role="alert">{error}</span>}
            <button type="submit" className="btn btn-1" disabled={busy}>{t('auth.devEnter')}</button>
          </form>
        ) : (
          <form onSubmit={submit} className="login-form">
            <h1>{t('auth.title')}</h1>
            <Field label={t('auth.email')}>{fid => <input id={fid} type="email" autoComplete="username" value={id} onChange={e => setId(e.target.value)} />}</Field>
            <Field label={t('auth.password')}>{fid => <input id={fid} type="password" autoComplete="current-password" value={secret} onChange={e => setSecret(e.target.value)} />}</Field>
            {error && <span className="err" role="alert">{error}</span>}
            <button type="submit" className="btn btn-1" disabled={busy || !id || !secret}>{busy ? t('auth.signingIn') : t('auth.signIn')}</button>
          </form>
        )}
      </div>
    </main>
  );
}

import { useState, type FormEvent } from 'react';
import { useI18n } from '../i18n';
import { Field } from '../ui';
import { useAuth } from './AuthProvider';

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
    try { await fn(); } catch (e) {
      const x = e as { name?: string; code?: string; message?: string } | null;
      const ids = [x?.message, x?.name, x?.code];
      const has = (k: string) => ids.includes(k);
      setError(has('CONFIG') ? t('auth.configMissing')
        : has('INVALID_DEV_ID') ? t('auth.invalidDevId')
        : has('UNSUPPORTED_CHALLENGE') ? t('auth.unsupportedChallenge')
        : has('NotAuthorizedException') || has('UserNotFoundException') ? t('auth.invalidCredentials')
        : t('auth.genericError'));
    } finally { setBusy(false); }
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

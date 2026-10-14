import { useState } from 'react';
import type { ImportResult, Locale, Me } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { clearLegacy, readLegacy } from '../legacy';
import { setPrefs, usePrefs, type Theme } from '../prefs';
import { useImportState, useUpdateMe } from '../queries';
import { Field, PageHead } from '../ui';

const THEMES: Theme[] = ['system', 'light', 'dark'];
const CURRENCIES = ['BRL', 'USD', 'EUR'];
const ZONES = ['America/Sao_Paulo', 'America/Manaus', 'America/New_York', 'Europe/Lisbon', 'UTC'];

export function Settings() {
  const { t, tOr, locale, currency, timezone } = useI18n();
  const prefs = usePrefs();
  const auth = useAuth();
  const update = useUpdateMe();
  const imp = useImportState();
  const [legacy, setLegacy] = useState(() => readLegacy());
  const [result, setResult] = useState<ImportResult | null>(null);
  const [err, setErr] = useState('');
  const [saved, setSaved] = useState(false);

  const save = (patch: Partial<Me>) => {
    if (update.isPending) return;
    setErr(''); setSaved(false);
    update.mutate({ locale, currency, timezone, ...patch }, { onSuccess: () => setSaved(true), onError: e => { setSaved(false); setErr(errorMessage(e, t)); } });
  };
  const doImport = async () => {
    if (imp.isPending) return;
    setErr('');
    try { setResult(await imp.mutateAsync(legacy!.state)); } catch (e) { setErr(errorMessage(e, t)); }
  };
  const zones = ZONES.includes(timezone) ? ZONES : [timezone, ...ZONES];

  return (
    <>
      <PageHead sub={t('settings.sub')} title={t('nav.settings')} />
      <section className="card">
        <h2>{t('settings.appearance')}</h2>
        <div className="seg" style={{ maxWidth: 360 }}>
          {THEMES.map(k => <button key={k} type="button" className={prefs.theme === k ? 'on' : ''} onClick={() => setPrefs({ theme: k })}>{tOr(`settings.theme.${k}`, k)}</button>)}
        </div>
        <div style={{ maxWidth: 360 }}>
          <Field label={t('settings.name')}>{id => <input id={id} value={prefs.userName} placeholder={t('settings.namePh')} onChange={e => setPrefs({ userName: e.target.value })} />}</Field>
        </div>
      </section>

      <section className="card">
        <h2>{t('settings.region')}</h2>
        <div className="grid" style={{ maxWidth: 720 }}>
          <Field label={t('settings.language')}>{id => (
            <select id={id} disabled={update.isPending} value={locale} onChange={e => save({ locale: e.target.value as Locale })}>
              <option value="pt-BR">Português (Brasil)</option><option value="en">English</option>
            </select>)}</Field>
          <Field label={t('settings.currency')}>{id => <select id={id} disabled={update.isPending} value={currency} onChange={e => save({ currency: e.target.value })}>{CURRENCIES.map(c => <option key={c}>{c}</option>)}</select>}</Field>
          <Field label={t('settings.timezone')}>{id => <select id={id} disabled={update.isPending} value={timezone} onChange={e => save({ timezone: e.target.value })}>{zones.map(z => <option key={z}>{z}</option>)}</select>}</Field>
        </div>
        {saved && <span className="muted" role="status">{t('settings.saved')}</span>}
      </section>

      {legacy && (
        <section className="card">
          <h2>{t('settings.import')}</h2>
          {!result ? (
            <>
              <p style={{ margin: 0, lineHeight: 1.5 }}>{t('settings.importBody', legacy.counts)}</p>
              <div className="actions"><button type="button" className="btn btn-1" disabled={imp.isPending} onClick={() => void doImport()}>{t('settings.importCta')}</button></div>
            </>
          ) : (
            <>
              <p style={{ margin: 0, lineHeight: 1.5 }}>{t('settings.importDone', { ...result })}</p>
              {(result.skippedTransactions + result.skippedBudgets + result.receiptsSkipped) > 0 && (
                <p className="muted" style={{ margin: 0 }}>{t('settings.importSkipped', { transactions: result.skippedTransactions, budgets: result.skippedBudgets, receipts: result.receiptsSkipped })}</p>)}
              <div className="actions"><button type="button" className="btn btn-2" onClick={() => { clearLegacy(); setLegacy(null); setResult(null); }}>{t('settings.clearLocal')}</button></div>
            </>
          )}
        </section>
      )}

      {err && <span className="err" role="alert">{err}</span>}

      <section className="card">
        <h2>{t('settings.session')}</h2>
        <div className="actions"><button type="button" className="btn btn-2" onClick={auth.signOut}>{t('common.logout')}</button></div>
      </section>
    </>
  );
}

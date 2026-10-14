import { useQueryClient } from '@tanstack/react-query';
import { App } from './App';
import { useAuth } from './auth/AuthProvider';
import { LoginPage } from './auth/LoginPage';
import { QueryState } from './components/QueryState';
import { browserLocale, I18nProvider, useI18n } from './i18n';
import { useMe } from './queries';

function Splash() {
  return <div className="splash" role="status" aria-busy="true">…</div>;
}
function DevBanner() {
  const { t } = useI18n();
  return <div className="banner" role="note">{t('auth.devBanner')}</div>;
}

function SignedIn() {
  const me = useMe();
  const { devMode } = useAuth();
  if (!me.data) {
    return (
      <I18nProvider locale={browserLocale()}>
        <QueryState q={me}>{() => null}</QueryState>
      </I18nProvider>
    );
  }
  return (
    <I18nProvider locale={me.data.locale} currency={me.data.currency} timezone={me.data.timezone}>
      {devMode && <DevBanner />}
      <App />
    </I18nProvider>
  );
}

export function Root() {
  const { status } = useAuth();
  useQueryClient();
  if (status === 'loading') return <Splash />;
  if (status !== 'signedIn') return <I18nProvider locale={browserLocale()}><LoginPage /></I18nProvider>;
  return <SignedIn />;
}

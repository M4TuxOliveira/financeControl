import { useAuth } from '../auth/AuthProvider';
import { useI18n } from '../i18n';
import { PageHead } from '../ui';

export function More() {
  const { t } = useI18n();
  const auth = useAuth();
  const links: [string, string, string][] = [
    ['transactions', t('nav.transactions'), t('more.transactionsDesc')],
    ['accounts', t('nav.accounts'), t('more.accountsDesc')],
    ['cards', t('nav.cards'), t('more.cardsDesc')],
    ['categories', t('nav.categories'), t('more.categoriesDesc')],
    ['settings', t('nav.settings'), t('more.settingsDesc')],
  ];
  return (
    <>
      <PageHead title={t('nav.more')} />
      <section className="card" style={{ padding: '8px 20px' }}>
        {links.map(([k, title, desc]) => (
          <a key={k} href={`#/${k}`} className="line" style={{ color: 'var(--ink)', minHeight: 56 }}>
            <span className="stack" style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{title}</b><span className="muted" style={{ fontSize: 13 }}>{desc}</span></span>
            <span className="muted" aria-hidden="true">›</span>
          </a>))}
      </section>
      <button type="button" className="btn btn-2" onClick={auth.signOut}>{t('common.logout')}</button>
    </>
  );
}

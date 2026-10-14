import { useEffect, useState } from 'react';
import { useAuth } from './auth/AuthProvider';
import { useI18n } from './i18n';
import { usePrefs } from './prefs';
import { NavIcon } from './ui';
import { Overview } from './pages/Overview';
import { Transactions } from './pages/Transactions';
import { Accounts } from './pages/Accounts';
import { Cards } from './pages/Cards';
import { Categories } from './pages/Categories';
import { Budgets } from './pages/Budgets';
import { Goals } from './pages/Goals';
import { Settings } from './pages/Settings';
import { More } from './pages/More';

const ROUTES = [
  ['overview', 'nav.overview'], ['transactions', 'nav.transactions'], ['accounts', 'nav.accounts'], ['cards', 'nav.cards'],
  ['categories', 'nav.categories'], ['budgets', 'nav.budgets'], ['goals', 'nav.goals'], ['settings', 'nav.settings'],
] as const;
const MORE = ['more', 'accounts', 'cards', 'categories', 'settings', 'transactions'];

const current = () => location.hash.replace(/^#\/?/, '').split('?')[0] || 'overview';

export function App() {
  const { theme } = usePrefs();
  const { t, locale } = useI18n();
  const auth = useAuth();
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const h = () => { setRoute(current()); window.scrollTo(0, 0); };
    addEventListener('hashchange', h);
    return () => removeEventListener('hashchange', h);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { document.documentElement.lang = locale; }, [locale]);
  useEffect(() => { document.title = t('app.title'); }, [t]);

  const page = {
    overview: <Overview />, transactions: <Transactions />, accounts: <Accounts />, cards: <Cards />,
    categories: <Categories />, budgets: <Budgets />, goals: <Goals />, settings: <Settings />, more: <More />,
  }[route] ?? <Overview />;

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><b>financeControl</b><span className="pro">PRO</span></div>
        <nav aria-label={t('nav.main')}>
          {ROUTES.map(([k, navKey]) => (
            <a key={k} href={'#/' + k} className={route === k ? 'on' : ''} aria-current={route === k ? 'page' : undefined}>{t(navKey)}</a>
          ))}
        </nav>
        <div className="side-foot"><button type="button" className="btn btn-2 side-logout" onClick={auth.signOut}>{t('common.logout')}</button></div>
      </aside>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
        <main className="main" style={{ width: '100%' }}>{page}</main>
      </div>
      <nav className="tabbar" aria-label={t('nav.main')}>
        <a href="#/overview" className={route === 'overview' ? 'on' : ''}><NavIcon name="overview" size={22} />{t('nav.home')}</a>
        <a href="#/budgets" className={route === 'budgets' ? 'on' : ''}><NavIcon name="budgets" size={22} />{t('nav.budgets')}</a>
        <a href="#/transactions?new" className="fab" aria-label={t('nav.newTransaction')}><NavIcon name="plus" size={24} /></a>
        <a href="#/goals" className={route === 'goals' ? 'on' : ''}><NavIcon name="goals" size={22} />{t('nav.goals')}</a>
        <a href="#/more" className={MORE.includes(route) && route !== 'transactions' ? 'on' : ''}><NavIcon name="more" size={22} />{t('nav.more')}</a>
      </nav>
    </div>
  );
}

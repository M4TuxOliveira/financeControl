import { useEffect, useState } from 'react';
import { useStore } from './store';
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

const ROUTES: [string, string][] = [
  ['overview', 'Overview'], ['transactions', 'Transactions'], ['accounts', 'Accounts'], ['cards', 'Credit cards'],
  ['categories', 'Categories'], ['budgets', 'Budgets'], ['goals', 'Goals'], ['settings', 'Settings'],
];
const MORE = ['more', 'accounts', 'cards', 'categories', 'settings', 'transactions'];

const current = () => location.hash.replace(/^#\/?/, '').split('?')[0] || 'overview';

export function App() {
  const s = useStore();
  const [route, setRoute] = useState(current);
  useEffect(() => {
    const h = () => { setRoute(current()); window.scrollTo(0, 0); };
    addEventListener('hashchange', h);
    return () => removeEventListener('hashchange', h);
  }, []);
  useEffect(() => { document.documentElement.dataset.theme = s.theme; }, [s.theme]);

  const page = {
    overview: <Overview />, transactions: <Transactions />, accounts: <Accounts />, cards: <Cards />,
    categories: <Categories />, budgets: <Budgets />, goals: <Goals />, settings: <Settings />, more: <More />,
  }[route] ?? <Overview />;

  return (
    <div className="app">
      <aside className="side">
        <div className="brand"><b>financeControl</b><span className="pro">PRO</span></div>
        <nav aria-label="Main">
          {ROUTES.map(([k, label]) => (
            <a key={k} href={'#/' + k} className={route === k ? 'on' : ''} aria-current={route === k ? 'page' : undefined}>{label}</a>
          ))}
        </nav>
      </aside>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', justifyContent: 'center' }}>
        <main className="main" style={{ width: '100%' }}>{page}</main>
      </div>
      <nav className="tabbar" aria-label="Main">
        <a href="#/overview" className={route === 'overview' ? 'on' : ''}><NavIcon name="overview" size={22} />Home</a>
        <a href="#/budgets" className={route === 'budgets' ? 'on' : ''}><NavIcon name="budgets" size={22} />Budgets</a>
        <a href="#/transactions?new" className="fab" aria-label="New transaction"><NavIcon name="plus" size={24} /></a>
        <a href="#/goals" className={route === 'goals' ? 'on' : ''}><NavIcon name="goals" size={22} />Goals</a>
        <a href="#/more" className={MORE.includes(route) && route !== 'transactions' ? 'on' : ''}><NavIcon name="more" size={22} />More</a>
      </nav>
    </div>
  );
}

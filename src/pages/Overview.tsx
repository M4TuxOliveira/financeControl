import { QueryState } from '../components/QueryState';
import { amountColor, signedAmount } from '../components/txFormat';
import { useI18n } from '../i18n';
import { txTitle } from '../i18n/txTitle';
import { usePrefs } from '../prefs';
import { useAccounts, useBudgets, useGoals, useOverview } from '../queries';
import { useAccountLookup, useCategoryLookup } from '../queries/lookups';
import { Bar, level, PageHead } from '../ui';

export function Overview() {
  const { t, tOr, money, dateShort, month, today } = useI18n();
  const { userName } = usePrefs();
  const key = today.slice(0, 7);
  const ov = useOverview(key);
  const accounts = useAccounts();
  const budgets = useBudgets(key);
  const goals = useGoals();
  const cats = useCategoryLookup();
  const acc = useAccountLookup();

  return (
    <>
      <PageHead sub={month(key, true)} title={userName ? t('overview.hi', { name: userName }) : t('nav.overview')}>
        <a href="#/transactions?new" className="btn btn-1">+ {t('nav.newTransaction')}</a>
      </PageHead>

      <QueryState q={ov}>{o => (
        <div className="kpis">
          <div className="hero"><span className="lbl">{t('overview.totalBalance')}</span><span className="num" style={{ fontSize: 28 }}>{money(o.totalBalance)}</span></div>
          <div className="card kpi"><span className="lbl">{t('overview.income', { month: month(key) })}</span><span className="num v" style={{ color: 'var(--pos)' }}>+ {money(o.income)}</span></div>
          <div className="card kpi"><span className="lbl">{t('overview.expenses', { month: month(key) })}</span><span className="num v" style={{ color: 'var(--neg)' }}>− {money(o.expense)}</span></div>
          <div className="card kpi"><span className="lbl">{t('overview.openStatements')}</span><span className="num v">{money(o.openStatementsTotal)}</span></div>
        </div>
      )}</QueryState>

      <div className="cols">
        <section className="card">
          <div className="card-head"><h2>{t('nav.accounts')}</h2><a href="#/accounts">{t('common.manage')}</a></div>
          <QueryState q={accounts} isEmpty={d => d.filter(a => !a.archived).length === 0}
            empty={<>{t('overview.noAccounts')}<a href="#/accounts">{t('overview.addAccount')}</a></>}>
            {list => <div>{list.filter(a => !a.archived).map(a => (
              <div className="line" key={a.id}>
                <span className="dot" style={{ background: a.color }} />
                <span style={{ flex: 1 }}>{a.name} <span className="muted" style={{ fontSize: 13 }}>· {tOr(`kind.${a.kind}`, a.kind)}</span></span>
                <span className="num">{money(a.balance)}</span>
              </div>))}</div>}
          </QueryState>
        </section>

        <section className="card">
          <div className="card-head"><h2>{t('nav.budgets')}</h2><a href="#/budgets">{t('common.manage')}</a></div>
          <QueryState q={budgets} isEmpty={d => d.length === 0} empty={<>{t('overview.noBudgets')}<a href="#/budgets">{t('overview.createBudget')}</a></>}>
            {list => <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{list.map(b => {
              const c = level(b.pct, b.alertPct);
              const cat = cats.categories.find(x => x.id === b.categoryId);
              return (
                <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="spread"><b style={{ fontWeight: 500 }}>{cat ? cats.name(cat) : '—'}</b><span style={{ color: c, fontWeight: 600 }}>{b.pct}%</span></div>
                  <Bar value={b.pct} color={c} />
                </div>);
            })}</div>}
          </QueryState>
        </section>

        <section className="card">
          <div className="card-head"><h2>{t('nav.goals')}</h2><a href="#/goals">{t('common.manage')}</a></div>
          <QueryState q={goals} isEmpty={d => d.length === 0} empty={<>{t('overview.noGoals')}<a href="#/goals">{t('overview.setGoal')}</a></>}>
            {list => <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{list.map(g => (
              <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div className="spread"><b style={{ fontWeight: 500 }}>{g.name}</b><span className="muted">{g.pct}% · {g.targetDate ? month(g.targetDate) : t('overview.noDate')}</span></div>
                <Bar value={g.pct} color="var(--pos)" />
              </div>))}</div>}
          </QueryState>
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2>{t('overview.recent')}</h2><a href="#/transactions">{t('common.seeAll')}</a></div>
        <QueryState q={ov} isEmpty={d => d.recent.length === 0} empty={<>{t('overview.noTx')}<a href="#/transactions?new">{t('overview.addTx')}</a></>}>
          {o => <div>{o.recent.map(x => (
            <div className="line" key={x.id}>
              <span className="muted" style={{ width: 54, fontSize: 13 }}>{dateShort(x.date)}</span>
              <span className="stack" style={{ flex: 1 }}>
                <span style={{ fontWeight: 500 }}>{txTitle(t, x)}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  {x.type === 'transfer' ? `${acc.name(x.accountId)} → ${acc.name(x.toId)}` : `${cats.label(x.categoryId)} · ${acc.name(x.accountId)}`}
                </span>
              </span>
              <span className="num" style={{ color: amountColor(x.type) }}>{signedAmount(x, money)}</span>
            </div>))}</div>}
        </QueryState>
      </section>
    </>
  );
}

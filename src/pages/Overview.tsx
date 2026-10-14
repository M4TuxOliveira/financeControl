import { useStore } from '../store';
import { Bar, Empty, PageHead, ratio } from '../ui';
import {
  accountBalance, accountName, budgetSpent, categoryColor, categoryLabel, fmtDate, fmtMonth, level, money,
  monthKey, monthTotals, openStatementTotal, pct, signed, sortTx, today, totalBalance, byId,
} from '../lib';

export function Overview() {
  const s = useStore();
  const key = monthKey(today());
  const { income, expense } = monthTotals(s, key);
  const recent = sortTx(s.transactions.filter(t => t.date <= today())).slice(0, 6);
  const kindLabel = { checking: 'Checking', savings: 'Savings', cash: 'Cash' };
  const accounts = s.accounts.filter(a => !a.archived);

  return (
    <>
      <PageHead sub={fmtMonth(key, true)} title={s.userName ? `Hi, ${s.userName}` : 'Overview'}>
        <a href="#/transactions?new" className="btn btn-1" style={{ color: '#fff' }}>+ New transaction</a>
      </PageHead>

      <div className="kpis">
        <div className="hero"><span className="lbl">Total balance</span><span className="num" style={{ fontSize: 28 }}>{money(totalBalance(s))}</span></div>
        <div className="card kpi"><span className="lbl">Income · {fmtMonth(key)}</span><span className="num v" style={{ color: 'var(--pos)' }}>+ {money(income)}</span></div>
        <div className="card kpi"><span className="lbl">Expenses · {fmtMonth(key)}</span><span className="num v" style={{ color: 'var(--neg)' }}>− {money(expense)}</span></div>
        <div className="card kpi"><span className="lbl">Open card statements</span><span className="num v">{money(openStatementTotal(s))}</span></div>
      </div>

      <div className="cols">
        <section className="card">
          <div className="card-head"><h2>Accounts</h2><a href="#/accounts">Manage</a></div>
          {accounts.length === 0 ? <Empty>No accounts yet.<a href="#/accounts">Add your first account</a></Empty> :
            <div>{accounts.map(a => (
              <div className="line" key={a.id}>
                <span className="dot" style={{ background: a.color }} />
                <span style={{ flex: 1 }}>{a.name} <span className="muted" style={{ fontSize: 13 }}>· {kindLabel[a.kind]}</span></span>
                <span className="num">{money(accountBalance(s, a))}</span>
              </div>))}</div>}
        </section>

        <section className="card">
          <div className="card-head"><h2>Budgets</h2><a href="#/budgets">Manage</a></div>
          {s.budgets.length === 0 ? <Empty>No budgets yet.<a href="#/budgets">Create one</a></Empty> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{s.budgets.map(b => {
              const spent = budgetSpent(s, b.categoryId, key), p = pct(spent, b.limit), c = level(p, b.alertPct);
              return (
                <div key={b.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="spread"><b style={{ fontWeight: 500 }}>{byId(s.categories, b.categoryId)?.name}</b><span style={{ color: c, fontWeight: 600 }}>{p}%</span></div>
                  <Bar value={ratio(spent, b.limit)} color={c} />
                </div>);
            })}</div>}
        </section>

        <section className="card">
          <div className="card-head"><h2>Goals</h2><a href="#/goals">Manage</a></div>
          {s.goals.length === 0 ? <Empty>No goals yet.<a href="#/goals">Set a goal</a></Empty> :
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>{s.goals.map(g => {
              const p = pct(g.saved, g.target);
              return (
                <div key={g.id} style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div className="spread"><b style={{ fontWeight: 500 }}>{g.name}</b><span className="muted">{p}% · {g.targetDate ? fmtMonth(g.targetDate) : 'no date'}</span></div>
                  <Bar value={ratio(g.saved, g.target)} color="var(--pos)" />
                </div>);
            })}</div>}
        </section>
      </div>

      <section className="card">
        <div className="card-head"><h2>Recent transactions</h2><a href="#/transactions">See all</a></div>
        {recent.length === 0 ? <Empty>Nothing recorded yet.<a href="#/transactions?new">Add a transaction</a></Empty> :
          <div>{recent.map(t => (
            <div className="line" key={t.id}>
              <span className="muted" style={{ width: 54, fontSize: 13 }}>{fmtDate(t.date)}</span>
              <span className="stack" style={{ flex: 1 }}>
                <span style={{ fontWeight: 500 }}>{t.desc}</span>
                <span className="muted" style={{ fontSize: 12 }}>
                  <span className="dot" style={{ background: categoryColor(s, t.categoryId), display: 'inline-block', marginRight: 6 }} />
                  {t.type === 'transfer' ? `${accountName(s, t.accountId)} → ${accountName(s, t.toId)}` : `${categoryLabel(s, t.categoryId)} · ${accountName(s, t.accountId)}`}
                </span>
              </span>
              <span className="num" style={{ color: t.type === 'income' ? 'var(--pos)' : t.type === 'expense' ? 'var(--neg)' : 'var(--ink)' }}>{signed(t)}</span>
            </div>))}</div>}
      </section>
    </>
  );
}

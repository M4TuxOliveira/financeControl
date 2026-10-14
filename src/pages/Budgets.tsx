import { useState } from 'react';
import { useStore } from '../store';
import { deleteBudget, saveBudget } from '../actions';
import { Bar, ConfirmDelete, Empty, Field, Modal, PageHead, ratio } from '../ui';
import { budgetSpent, byId, fmtMonth, level, money, moneyInput, monthKey, parseMoney, pct, today, uid } from '../lib';
import type { Budget } from '../types';

export function Budgets() {
  const s = useStore();
  const key = monthKey(today());
  const [form, setForm] = useState<Budget | 'new' | null>(null);
  const [del, setDel] = useState<Budget | null>(null);
  const rows = s.budgets.map(b => ({ b, spent: budgetSpent(s, b.categoryId, key) }));
  const limit = rows.reduce((n, r) => n + r.b.limit, 0), spent = rows.reduce((n, r) => n + r.spent, 0);

  return (
    <>
      <PageHead sub={fmtMonth(key, true)} title="Budgets">
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ New budget</button>
      </PageHead>
      {rows.length > 0 && <div className="kpis">
        <div className="hero"><span className="lbl">Spent of budgeted</span><span className="num" style={{ fontSize: 26 }}>{money(spent)}</span><span style={{ fontSize: 13, color: '#B9BEC6' }}>of {money(limit)} · {pct(spent, limit)}%</span></div>
        <div className="card kpi"><span className="lbl">Left this month</span><span className="num v">{money(Math.max(0, limit - spent))}</span></div>
      </div>}
      {rows.length === 0 ? <section className="card"><Empty>No budgets yet.<button type="button" className="btn btn-1" onClick={() => setForm('new')}>Create a budget</button></Empty></section> :
        <div className="cols">{rows.map(({ b, spent }) => {
          const p = pct(spent, b.limit), c = level(p, b.alertPct), cat = byId(s.categories, b.categoryId);
          return (
            <section className="card" key={b.id}>
              <div className="spread"><h2>{cat?.name}</h2><span style={{ color: c, fontWeight: 600 }}>{p}%</span></div>
              <Bar value={ratio(spent, b.limit)} color={c} />
              <div className="spread muted" style={{ fontSize: 13 }}>
                <span>{money(spent)} spent</span>
                <span>{spent > b.limit ? `${money(spent - b.limit)} over` : `${money(b.limit - spent)} left`} · limit {money(b.limit)}</span></div>
              <div className="actions">
                <button type="button" className="btn-sm" onClick={() => setForm(b)}>Edit</button>
                <button type="button" className="btn-sm danger" onClick={() => setDel(b)}>Delete</button>
              </div>
            </section>);
        })}</div>}
      {form && <BudgetForm budget={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {del && <ConfirmDelete title={`Delete ${byId(s.categories, del.categoryId)?.name} budget?`} cta="Delete budget" onClose={() => setDel(null)}
        body="Your transactions are kept; only the monthly limit is removed." onConfirm={() => deleteBudget(del.id)} />}
    </>
  );
}

function BudgetForm({ budget, onClose }: { budget: Budget | null; onClose: () => void }) {
  const s = useStore();
  const free = s.categories.filter(c => !c.parentId && (c.id === budget?.categoryId || !s.budgets.some(b => b.categoryId === c.id)));
  const [catId, setCatId] = useState(budget?.categoryId ?? free[0]?.id ?? '');
  const [lim, setLim] = useState(budget ? moneyInput(budget.limit) : '');
  const [alert, setAlert] = useState(budget?.alertPct ?? 85);
  const [err, setErr] = useState('');
  const submit = () => {
    if (!catId) return setErr('Pick a category.');
    const v = parseMoney(lim);
    if (!v) return setErr('Enter a monthly limit.');
    saveBudget({ id: budget?.id ?? uid(), categoryId: catId, limit: v, alertPct: alert }); onClose();
  };
  return (
    <Modal title={budget ? 'Edit budget' : 'New budget'} onClose={onClose}>
      <div className="grid">
        <Field label="Category">{id => <select id={id} value={catId} onChange={e => setCatId(e.target.value)} disabled={!free.length}>
          {free.length ? free.map(c => <option key={c.id} value={c.id}>{c.name}</option>) : <option>All categories have a budget</option>}</select>}</Field>
        <Field label="Monthly limit" error={err}>{id => <input id={id} inputMode="decimal" placeholder="R$ 0,00" value={lim} onChange={e => setLim(e.target.value)} autoFocus />}</Field>
        <Field label="Alert at">{id => <select id={id} value={alert} onChange={e => setAlert(Number(e.target.value))}>{[70, 80, 85, 90, 100].map(n => <option key={n} value={n}>{n}% of limit</option>)}</select>}</Field>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>Applies every month and counts the category together with its subcategories.</p>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-1" onClick={submit}>{budget ? 'Save changes' : 'Create budget'}</button>
      </div>
    </Modal>
  );
}

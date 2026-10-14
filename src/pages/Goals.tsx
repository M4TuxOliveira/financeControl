import { useState } from 'react';
import { useStore } from '../store';
import { contribute, deleteGoal, saveGoal } from '../actions';
import { Bar, ConfirmDelete, Empty, Field, Modal, PageHead, ratio } from '../ui';
import { accountBalance, accountName, fmtMonth, money, moneyInput, monthKey, parseMoney, pct, today, uid } from '../lib';
import type { Goal } from '../types';

export function Goals() {
  const s = useStore();
  const [form, setForm] = useState<Goal | 'new' | null>(null);
  const [add, setAdd] = useState<Goal | null>(null);
  const [del, setDel] = useState<Goal | null>(null);
  const saved = s.goals.reduce((n, g) => n + g.saved, 0), target = s.goals.reduce((n, g) => n + g.target, 0);

  const monthsLeft = (g: Goal) => {
    if (!g.targetDate) return 0;
    const [ty, tm] = g.targetDate.split('-').map(Number), [y, m] = monthKey(today()).split('-').map(Number);
    return Math.max(0, (ty - y) * 12 + (tm - m));
  };

  return (
    <>
      <PageHead sub={`${s.goals.length} goal${s.goals.length === 1 ? '' : 's'}`} title="Goals">
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ New goal</button>
      </PageHead>
      {s.goals.length > 0 && <div className="kpis">
        <div className="hero"><span className="lbl">Saved so far</span><span className="num" style={{ fontSize: 26 }}>{money(saved)}</span><span style={{ fontSize: 13, color: '#B9BEC6' }}>of {money(target)} · {pct(saved, target)}%</span></div>
      </div>}
      {s.goals.length === 0 ? <section className="card"><Empty>No goals yet.<button type="button" className="btn btn-1" onClick={() => setForm('new')}>Set a goal</button></Empty></section> :
        <div className="cols">{s.goals.map(g => {
          const p = pct(g.saved, g.target), left = Math.max(0, g.target - g.saved), mo = monthsLeft(g);
          return (
            <section className="card" key={g.id}>
              <div className="spread"><h2>{g.name}</h2><span className="num">{p}%</span></div>
              <Bar value={ratio(g.saved, g.target)} color="var(--pos)" />
              <div className="spread muted" style={{ fontSize: 13 }}><span>{money(g.saved)} of {money(g.target)}</span><span>{g.targetDate ? fmtMonth(g.targetDate) : 'No target date'}</span></div>
              <span className="muted" style={{ fontSize: 13 }}>
                {left === 0 ? 'Goal reached' : g.targetDate ? (mo > 0 ? `${money(Math.ceil(left / mo))}/month for ${mo} month${mo === 1 ? '' : 's'}` : 'Target date reached') : `${money(left)} to go`}
                {g.accountId && ` · in ${accountName(s, g.accountId)}`}</span>
              <div className="actions">
                <button type="button" className="btn-sm" onClick={() => setAdd(g)}>Add money</button>
                <button type="button" className="btn-sm" onClick={() => setForm(g)}>Edit</button>
                <button type="button" className="btn-sm danger" onClick={() => setDel(g)}>Delete</button>
              </div>
            </section>);
        })}</div>}
      {form && <GoalForm goal={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {add && <AddMoney goal={add} onClose={() => setAdd(null)} />}
      {del && <ConfirmDelete title={`Delete ${del.name}?`} cta="Delete goal" onClose={() => setDel(null)}
        body="The money stays in your account; only the goal tracking is removed." onConfirm={() => deleteGoal(del.id)} />}
    </>
  );
}

function GoalForm({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const s = useStore();
  const [name, setName] = useState(goal?.name ?? '');
  const [acc, setAcc] = useState(goal?.accountId ?? s.accounts.find(a => a.kind === 'savings')?.id ?? '');
  const [target, setTarget] = useState(goal ? moneyInput(goal.target) : '');
  const [date, setDate] = useState(goal?.targetDate ?? '');
  const [saved, setSaved] = useState(goal ? moneyInput(goal.saved) : '');
  const [err, setErr] = useState('');
  const submit = () => {
    if (!name.trim()) return setErr('Give the goal a name.');
    const t = parseMoney(target);
    if (!t) return setErr('Enter a target amount.');
    saveGoal({ id: goal?.id ?? uid(), name: name.trim(), accountId: acc, target: t, targetDate: date, saved: parseMoney(saved) });
    onClose();
  };
  return (
    <Modal title={goal ? 'Edit goal' : 'New goal'} onClose={onClose}>
      <div className="grid">
        <Field label="Goal name">{id => <input id={id} placeholder="e.g. Japan trip" value={name} autoFocus onChange={e => setName(e.target.value)} />}</Field>
        <Field label="Linked savings account">{id => <select id={id} value={acc} onChange={e => setAcc(e.target.value)}><option value="">None</option>{s.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}</Field>
        <Field label="Target amount" error={err}>{id => <input id={id} inputMode="decimal" placeholder="R$ 0,00" value={target} onChange={e => setTarget(e.target.value)} />}</Field>
        <Field label="Target month">{id => <input id={id} type="month" value={date} onChange={e => setDate(e.target.value)} />}</Field>
        <Field label="Already saved">{id => <input id={id} inputMode="decimal" placeholder="R$ 0,00" value={saved} onChange={e => setSaved(e.target.value)} />}</Field>
      </div>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-1" onClick={submit}>{goal ? 'Save changes' : 'Create goal'}</button>
      </div>
    </Modal>
  );
}

function AddMoney({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const s = useStore();
  const accounts = s.accounts.filter(a => !a.archived);
  const [amt, setAmt] = useState('');
  const [from, setFrom] = useState(accounts.find(a => a.id !== goal.accountId)?.id ?? goal.accountId);
  const [err, setErr] = useState('');
  const submit = () => {
    const v = parseMoney(amt);
    if (!v) return setErr('Enter an amount.');
    contribute(goal, v, from, today()); onClose();
  };
  return (
    <Modal title={`Add money to ${goal.name}`} onClose={onClose}>
      <div className="grid">
        <Field label="Amount" error={err}>{id => <input id={id} inputMode="decimal" placeholder="R$ 0,00" value={amt} autoFocus onChange={e => setAmt(e.target.value)} />}</Field>
        <Field label="From account">{id => <select id={id} value={from} onChange={e => setFrom(e.target.value)}>
          {accounts.map(a => <option key={a.id} value={a.id}>{a.name} · {money(accountBalance(s, a))}</option>)}</select>}</Field>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>{from && from !== goal.accountId ? `Records a transfer to ${accountName(s, goal.accountId)}.` : 'Money is already in the linked account; only the goal progress changes.'}</p>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-1" onClick={submit}>Add to goal</button>
      </div>
    </Modal>
  );
}

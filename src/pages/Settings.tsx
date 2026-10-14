import { useRef, useState } from 'react';
import { freshState, getState, replaceState, update, useStore } from '../store';
import { PageHead } from '../ui';
import { today, uid, addDays, addMonths } from '../lib';
import type { State, Theme } from '../types';

function demo(): State {
  const s = freshState();
  const cat = (n: string) => s.categories.find(c => c.name === n)!.id;
  const itau = uid(), nu = uid(), wallet = uid(), card = uid();
  const t = today(), m = (d: number) => addMonths(t, d);
  const tx = (type: 'expense' | 'income' | 'transfer', amount: number, date: string, desc: string, accountId: string, categoryId?: string, toId?: string) =>
    ({ id: uid(), type, amount, date, desc, accountId, categoryId, toId, tags: [], note: '' });
  return {
    ...s, userName: 'Demo',
    accounts: [
      { id: itau, name: 'Itaú Personnalité', kind: 'checking', bank: 'Itaú Unibanco', opening: 600000, color: '#1F4E79', inTotal: true, archived: false },
      { id: nu, name: 'Nubank Caixinha', kind: 'savings', bank: 'Nubank', opening: 1088000, color: '#6E3FA0', inTotal: true, archived: false },
      { id: wallet, name: 'Wallet', kind: 'cash', bank: '', opening: 40000, color: '#3D5A0E', inTotal: true, archived: false },
    ],
    cards: [{ id: card, name: 'Nubank Platinum', network: 'Mastercard', limit: 600000, closeDay: 3, dueDay: 10, color: '#6E3FA0', payAccountId: itau }],
    transactions: [
      tx('income', 980000, addDays(t, -3), 'Salary', itau, cat('Salary')),
      tx('expense', 78000, addDays(t, -5), 'Condo fee', itau, cat('Condo fee')),
      tx('expense', 3240, addDays(t, -7), 'Padaria Real', wallet, cat('Bakery')),
      tx('expense', 8690, addDays(t, -1), 'iFood', card, cat('Delivery')),
      tx('expense', 4090, addDays(t, -2), 'Spotify Family', card, cat('Subscriptions')),
      tx('expense', 31250, m(-1), 'Fast Shop · TV 55"', card, cat('Electronics')),
      tx('transfer', 200000, addDays(t, -4), 'Card payment', itau, undefined, card),
    ],
    budgets: [
      { id: uid(), categoryId: cat('Food'), limit: 50000, alertPct: 85 },
      { id: uid(), categoryId: cat('Groceries'), limit: 120000, alertPct: 85 },
    ],
    goals: [{ id: uid(), name: 'Emergency fund', accountId: nu, target: 3000000, targetDate: m(8).slice(0, 7), saved: 1500000 }],
  };
}

export function Settings() {
  const s = useStore();
  const file = useRef<HTMLInputElement>(null);
  const [msg, setMsg] = useState('');
  const counts = `${s.accounts.length} accounts · ${s.cards.length} cards · ${s.transactions.length} transactions`;

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(getState(), null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `financeControl-${today()}.json`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  const importJson = async (f: File) => {
    try {
      const data = JSON.parse(await f.text());
      if (data?.v !== 1 || !Array.isArray(data.transactions)) throw new Error();
      if (!confirm('Replace all current data with this backup?')) return;
      replaceState(data);
      setMsg('Backup restored.');
    } catch { setMsg('That file is not a financeControl backup.'); }
  };

  return (
    <>
      <PageHead sub={counts} title="Settings" />
      <section className="card">
        <h2>Appearance</h2>
        <div className="seg" style={{ maxWidth: 360 }}>
          {(['system', 'light', 'dark'] as Theme[]).map(t => (
            <button key={t} type="button" className={s.theme === t ? 'on' : ''} onClick={() => update(x => ({ ...x, theme: t }))}>{t[0].toUpperCase() + t.slice(1)}</button>))}
        </div>
        <div className="fld" style={{ maxWidth: 360 }}>
          <label htmlFor="name">Your name</label>
          <input id="name" value={s.userName} placeholder="Shown in the greeting" onChange={e => update(x => ({ ...x, userName: e.target.value }))} />
        </div>
      </section>
      <section className="card">
        <h2>Your data</h2>
        <p className="muted" style={{ margin: 0, lineHeight: 1.5 }}>Everything is stored only in this browser (localStorage). Nothing is sent to a server. Export a backup regularly, and use it to move to another device.</p>
        <div className="actions">
          <button type="button" className="btn btn-1" onClick={exportJson}>Export backup</button>
          <button type="button" className="btn btn-2" onClick={() => file.current?.click()}>Import backup</button>
          <input ref={file} type="file" accept="application/json" className="sr" onChange={e => { const f = e.target.files?.[0]; if (f) importJson(f); e.target.value = ''; }} />
        </div>
        {msg && <span role="status" className="muted">{msg}</span>}
      </section>
      <section className="card">
        <h2>Start over</h2>
        <div className="actions">
          <button type="button" className="btn btn-2" onClick={() => confirm('Replace your data with sample data?') && replaceState(demo())}>Load sample data</button>
          <button type="button" className="btn btn-3" onClick={() => confirm('Delete ALL data in this browser? This cannot be undone.') && replaceState(freshState())}>Erase everything</button>
        </div>
      </section>
    </>
  );
}

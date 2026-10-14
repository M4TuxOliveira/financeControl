import { useEffect, useMemo, useState } from 'react';
import { useStore } from '../store';
import { addTransactions, createTransactions, deleteTx, saveTx, type DeleteScope } from '../actions';
import { ConfirmDelete, Empty, Field, Modal, OptionRadio, PageHead } from '../ui';
import {
  accountName, categoryColor, categoryFamily, categoryLabel, fmtDate, fmtMonth, money, moneyInput, monthKey,
  parseMoney, signed, sortTx, today, byId,
} from '../lib';
import type { Repeat, State, Tx, TxType } from '../types';

const AMT_COLOR: Record<TxType, string> = { expense: 'var(--neg)', income: 'var(--pos)', transfer: 'var(--ink)' };

function subText(t: Tx) {
  const bits: string[] = [];
  if (t.inst) bits.push(`Installment ${t.inst.i}/${t.inst.n}`);
  if (t.repeat) bits.push(`Repeats ${t.repeat === 'weekly' ? 'weekly' : t.repeat === 'yearly' ? 'yearly' : 'monthly'}`);
  if (t.date > today()) bits.push('Scheduled');
  if (t.receipt) bits.push('Receipt attached');
  return bits.join(' · ') || ' ';
}

export function Transactions() {
  const s = useStore();
  const [form, setForm] = useState<Tx | 'new' | null>(null);
  const [del, setDel] = useState<Tx | null>(null);
  const [q, setQ] = useState('');
  const [period, setPeriod] = useState(monthKey(today()));
  const [acc, setAcc] = useState('');
  const [cat, setCat] = useState('');
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');

  // The mobile "+" button links to #/transactions?new
  useEffect(() => {
    const check = () => {
      if (location.hash.includes('?new')) { history.replaceState(null, '', '#/transactions'); setForm('new'); }
    };
    check();
    addEventListener('hashchange', check);
    return () => removeEventListener('hashchange', check);
  }, []);

  const months = useMemo(() => {
    const set = new Set(s.transactions.map(t => monthKey(t.date)));
    set.add(monthKey(today()));
    return [...set].sort().reverse();
  }, [s.transactions]);
  const tags = useMemo(() => [...new Set(s.transactions.flatMap(t => t.tags))].sort(), [s.transactions]);

  const rows = useMemo(() => {
    const fam = cat ? categoryFamily(s, cat) : null;
    const needle = q.trim().toLowerCase();
    return sortTx(s.transactions.filter(t =>
      (!period || monthKey(t.date) === period) &&
      (!acc || t.accountId === acc || t.toId === acc) &&
      (!fam || (t.categoryId && fam.includes(t.categoryId))) &&
      (!type || t.type === type) &&
      (!tag || t.tags.includes(tag)) &&
      (!needle || (t.desc + ' ' + t.note + ' ' + t.tags.join(' ')).toLowerCase().includes(needle))));
  }, [s, q, period, acc, cat, type, tag]);

  const income = rows.filter(t => t.type === 'income').reduce((n, t) => n + t.amount, 0);
  const expense = rows.filter(t => t.type === 'expense').reduce((n, t) => n + t.amount, 0);
  const noAccounts = s.accounts.length + s.cards.length === 0;

  return (
    <>
      <PageHead sub={`${period ? fmtMonth(period, true) : 'All time'} · ${rows.length} transaction${rows.length === 1 ? '' : 's'}`} title="Transactions">
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ New transaction</button>
      </PageHead>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <label htmlFor="tx-q" className="sr">Search</label>
        <input id="tx-q" className="flt" placeholder="Search description, tag, note" style={{ flex: '1 1 220px' }} value={q} onChange={e => setQ(e.target.value)} />
        <select className="flt" aria-label="Period" value={period} onChange={e => setPeriod(e.target.value)}>
          <option value="">All time</option>{months.map(m => <option key={m} value={m}>{fmtMonth(m)}</option>)}</select>
        <select className="flt" aria-label="Account" value={acc} onChange={e => setAcc(e.target.value)}>
          <option value="">All accounts &amp; cards</option>
          {[...s.accounts, ...s.cards].map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        <select className="flt" aria-label="Category" value={cat} onChange={e => setCat(e.target.value)}>
          <option value="">All categories</option>
          {s.categories.filter(c => !c.parentId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
        <select className="flt" aria-label="Type" value={type} onChange={e => setType(e.target.value)}>
          <option value="">All types</option><option value="expense">Expenses</option><option value="income">Income</option><option value="transfer">Transfers</option></select>
        <select className="flt" aria-label="Tag" value={tag} onChange={e => setTag(e.target.value)}>
          <option value="">Any tag</option>{tags.map(g => <option key={g}>{g}</option>)}</select>
      </div>

      <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
        <div className="card kpi" style={{ padding: 16, gap: 4 }}><span className="lbl">Income</span><span className="num" style={{ fontSize: 20, color: 'var(--pos)' }}>+ {money(income)}</span></div>
        <div className="card kpi" style={{ padding: 16, gap: 4 }}><span className="lbl">Expenses</span><span className="num" style={{ fontSize: 20, color: 'var(--neg)' }}>− {money(expense)}</span></div>
        <div className="card kpi" style={{ padding: 16, gap: 4 }}><span className="lbl">Net</span><span className="num" style={{ fontSize: 20 }}>{money(income - expense)}</span></div>
      </div>

      <section className="card" style={{ padding: '6px 20px 10px' }}>
        {rows.length === 0 ? <Empty>{s.transactions.length === 0 ? 'No transactions yet.' : 'No transactions match these filters.'}
          {s.transactions.length === 0 && <button type="button" className="btn btn-1" onClick={() => setForm('new')}>Add the first one</button>}</Empty> : (
          <div className="scroll"><div>
            <div className="trow thead tx-cols"><span className="th">Date</span><span className="th">Description</span><span className="th hide-m">Category</span><span className="th hide-m">Account</span><span className="th hide-m">Tags</span><span className="th r">Amount</span><span className="th r">Actions</span></div>
            {rows.map(t => (
              <div className="trow tx-cols" key={t.id}>
                <span className="muted hide-m" style={{ fontSize: 13 }}>{fmtDate(t.date)}</span>
                <span className="stack"><span style={{ fontWeight: 500 }}>{t.desc}</span>
                  <span className="muted" style={{ fontSize: 12 }}><span className="hide-d">{fmtDate(t.date)} · </span>{subText(t)}<span className="hide-d"> {t.type === 'transfer' ? '' : `· ${categoryLabel(s, t.categoryId)}`}</span></span></span>
                <span className="hide-m" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {t.type !== 'transfer' && <span className="dot" style={{ background: categoryColor(s, t.categoryId) }} />}{t.type === 'transfer' ? 'Transfer' : categoryLabel(s, t.categoryId)}</span>
                <span className="hide-m" style={{ color: 'var(--ink-2)' }}>{t.type === 'transfer' ? `${accountName(s, t.accountId)} → ${accountName(s, t.toId)}` : accountName(s, t.accountId)}</span>
                <span className="hide-m" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{t.tags.map(g => <span className="tag" key={g}>{g}</span>)}</span>
                <span className="num r" style={{ color: AMT_COLOR[t.type] }}>{signed(t)}</span>
                <span className="actions-c" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-sm" onClick={() => setForm(t)}>Edit</button>
                  <button type="button" className="btn-sm danger" onClick={() => setDel(t)}>Delete</button>
                </span>
              </div>))}
          </div></div>)}
      </section>

      {form && (noAccounts
        ? <Modal title="Add an account first" onClose={() => setForm(null)}>
            <p style={{ margin: 0, lineHeight: 1.5 }}>Transactions belong to an account or credit card.</p>
            <div className="footer"><a className="btn btn-1" href="#/accounts" onClick={() => setForm(null)} style={{ color: '#fff' }}>Go to Accounts</a></div></Modal>
        : <TxForm tx={form === 'new' ? null : form} onClose={() => setForm(null)} />)}
      {del && <DeleteTx tx={del} onClose={() => setDel(null)} />}
    </>
  );
}

function resizeImage(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const k = Math.min(1, 900 / Math.max(img.width, img.height));
      const c = document.createElement('canvas');
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
      c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height);
      resolve(c.toDataURL('image/jpeg', 0.7));
    };
    img.onerror = reject;
    img.src = URL.createObjectURL(file);
  });
}

function blank(s: State) {
  return {
    type: 'expense' as TxType, amount: '', date: today(), accountId: (s.accounts.find(a => !a.archived) ?? s.cards[0] ?? s.accounts[0])?.id ?? '',
    toId: '', desc: '', parent: '', sub: '', tags: '', repeat: '' as Repeat | '', inst: false, n: 3, note: '', receipt: undefined as string | undefined,
  };
}

function TxForm({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const s = useStore();
  const initial = () => {
    if (!tx) return blank(s);
    const c = byId(s.categories, tx.categoryId);
    return {
      type: tx.type, amount: moneyInput(tx.amount), date: tx.date, accountId: tx.accountId, toId: tx.toId ?? '', desc: tx.desc,
      parent: c ? (c.parentId ?? c.id) : '', sub: c?.parentId ? c.id : '', tags: tx.tags.join(', '), repeat: (tx.repeat ?? '') as Repeat | '',
      inst: false, n: 3, note: tx.note, receipt: tx.receipt,
    };
  };
  const [f, setF] = useState(initial);
  const [err, setErr] = useState('');
  const set = <K extends keyof ReturnType<typeof blank>>(k: K, v: ReturnType<typeof blank>[K]) => setF(x => ({ ...x, [k]: v }));

  const fromOptions = f.type === 'expense' ? [...s.accounts.filter(a => !a.archived), ...s.cards] : s.accounts.filter(a => !a.archived);
  const toOptions = [...s.accounts.filter(a => !a.archived), ...s.cards];
  const total = parseMoney(f.amount);
  const instOn = f.inst && f.type === 'expense' && !tx;
  const subs = s.categories.filter(c => c.parentId === f.parent);

  const submit = (another: boolean) => {
    if (!total) return setErr('Enter an amount.');
    if (!f.desc.trim()) return setErr('Add a description.');
    if (!f.accountId) return setErr('Choose an account.');
    if (f.type === 'transfer' && (!f.toId || f.toId === f.accountId)) return setErr('Pick two different accounts.');
    const draft = {
      type: f.type, amount: total, date: f.date || today(), desc: f.desc.trim(), accountId: f.accountId,
      toId: f.type === 'transfer' ? f.toId : undefined,
      categoryId: f.type === 'transfer' ? undefined : (f.sub || f.parent || undefined),
      tags: f.tags.split(/[,\s]+/).filter(Boolean).map(g => (g.startsWith('#') ? g : '#' + g)),
      note: f.note.trim(), receipt: f.receipt,
    };
    if (tx) saveTx({ ...tx, ...draft });
    else addTransactions(createTransactions(draft, { installments: instOn ? f.n : 0, repeat: instOn ? undefined : f.repeat || undefined }));
    if (another) { setF({ ...blank(s), type: f.type, date: f.date, accountId: f.accountId }); setErr(''); } else onClose();
  };

  const Opts = ({ list }: { list: { id: string; name: string }[] }) => <>{list.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</>;

  return (
    <Modal wide title={tx ? 'Edit transaction' : 'New transaction'} onClose={onClose}
      extra={<div className="seg">{(['expense', 'income', 'transfer'] as TxType[]).map(t => (
        <button key={t} type="button" className={f.type === t ? 'on' : ''} onClick={() => setF(x => ({ ...x, type: t, inst: false, toId: '' }))}>{t[0].toUpperCase() + t.slice(1)}</button>))}</div>}>
      <div className="grid">
        <Field label="Amount">{id => <input id={id} inputMode="decimal" placeholder="R$ 0,00" value={f.amount} autoFocus onChange={e => set('amount', e.target.value)}
          style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 18, color: AMT_COLOR[f.type] }} />}</Field>
        <Field label="Date">{id => <input id={id} type="date" value={f.date} onChange={e => set('date', e.target.value)} />}</Field>
        <Field label={f.type === 'transfer' ? 'From' : f.type === 'income' ? 'Account' : 'Account or card'}>{id =>
          <select id={id} value={f.accountId} onChange={e => set('accountId', e.target.value)}>
            {f.type === 'expense' ? <>
              <optgroup label="Accounts"><Opts list={s.accounts.filter(a => !a.archived)} /></optgroup>
              {s.cards.length > 0 && <optgroup label="Credit cards"><Opts list={s.cards} /></optgroup>}</> : <Opts list={fromOptions} />}
          </select>}</Field>
        {f.type === 'transfer' && <Field label="To">{id =>
          <select id={id} value={f.toId} onChange={e => set('toId', e.target.value)}>
            <option value="">Select…</option>
            <optgroup label="Accounts"><Opts list={s.accounts.filter(a => !a.archived && a.id !== f.accountId)} /></optgroup>
            {s.cards.length > 0 && <optgroup label="Credit cards (pay statement)"><Opts list={s.cards} /></optgroup>}
          </select>}</Field>}
      </div>
      <div className="grid">
        <Field label="Description">{id => <input id={id} placeholder="What was it?" value={f.desc} onChange={e => set('desc', e.target.value)} />}</Field>
        {f.type !== 'transfer' && <>
          <Field label="Category">{id => <select id={id} value={f.parent} onChange={e => setF(x => ({ ...x, parent: e.target.value, sub: '' }))}>
            <option value="">Select category</option>{s.categories.filter(c => !c.parentId).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field>
          <Field label="Subcategory">{id => <select id={id} value={f.sub} onChange={e => set('sub', e.target.value)} disabled={!subs.length}>
            <option value="">None</option>{subs.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}</Field></>}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        <Field label="Tags">{id => <input id={id} placeholder="#weekend, #trip" value={f.tags} onChange={e => set('tags', e.target.value)} />}</Field>
        {!tx && <Field label="Repeat">{id => <select id={id} value={instOn ? '' : f.repeat} disabled={instOn} onChange={e => set('repeat', e.target.value as Repeat | '')}>
          <option value="">Never</option><option value="weekly">Weekly (next 26)</option><option value="monthly">Monthly (next 12)</option><option value="yearly">Yearly (next 3)</option></select>}</Field>}
      </div>
      {f.type === 'expense' && !tx && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', padding: 14, borderRadius: 14, background: 'var(--bg)' }}>
          <label className="check" style={{ fontWeight: 500 }}><input type="checkbox" checked={f.inst} onChange={e => set('inst', e.target.checked)} />Split in installments</label>
          {instOn && <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" className="btn-sm" aria-label="Fewer installments" style={{ width: 40, height: 40 }} onClick={() => set('n', Math.max(2, f.n - 1))}>−</button>
              <span className="num" style={{ width: 44, textAlign: 'center', fontSize: 17 }}>{f.n}x</span>
              <button type="button" className="btn-sm" aria-label="More installments" style={{ width: 40, height: 40 }} onClick={() => set('n', Math.min(24, f.n + 1))}>+</button>
            </div>
            <span className="muted" style={{ fontSize: 13 }}>{f.n} × {money(Math.floor(total / f.n))}, one per month</span></>}
        </div>)}
      {tx && (tx.inst || tx.repeat) && <span className="muted" style={{ fontSize: 13 }}>This entry is part of a series — edits apply to this one only.</span>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        <Field label="Notes">{id => <textarea id={id} placeholder="Optional" value={f.note} onChange={e => set('note', e.target.value)} />}</Field>
        <div className="fld"><span className="lbl">Receipt</span>
          <label className="drop">
            {f.receipt ? <img src={f.receipt} alt="Receipt" /> : <>Drop image or click to upload</>}
            <input type="file" accept="image/*" className="sr" onChange={async e => { const file = e.target.files?.[0]; if (file) set('receipt', await resizeImage(file)); }} />
          </label>
          {f.receipt && <button type="button" className="link" style={{ textAlign: 'left' }} onClick={() => set('receipt', undefined)}>Remove receipt</button>}
        </div>
      </div>
      {err && <span className="err" role="alert">{err}</span>}
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>Cancel</button>
        {!tx && <button type="button" className="btn btn-2" onClick={() => submit(true)}>Save &amp; add another</button>}
        <button type="button" className="btn btn-1" onClick={() => submit(false)}>{tx ? 'Save changes' : 'Save'}</button>
      </div>
    </Modal>
  );
}

function DeleteTx({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  const s = useStore();
  const [scope, setScope] = useState<DeleteScope>('one');
  const series = tx.groupId ? s.transactions.filter(t => t.groupId === tx.groupId).length : 0;
  return (
    <ConfirmDelete title={`Delete “${tx.desc}”?`} cta="Delete" onClose={onClose} onConfirm={() => deleteTx(tx, scope)}
      body={`${signed(tx)} on ${fmtDate(tx.date)} · balances and statements will be recalculated.`}>
      {series > 1 && <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <OptionRadio name="scope" checked={scope === 'one'} onChange={() => setScope('one')}>Only this one</OptionRadio>
        <OptionRadio name="scope" checked={scope === 'future'} onChange={() => setScope('future')}>This and all future ones</OptionRadio>
        <OptionRadio name="scope" checked={scope === 'all'} onChange={() => setScope('all')}>{tx.inst ? `All ${tx.inst.n} installments` : `Every occurrence of this repeat (${series})`}</OptionRadio>
      </div>}
    </ConfirmDelete>
  );
}

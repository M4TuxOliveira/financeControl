import { useState } from 'react';
import { useStore } from '../store';
import { deleteCard, payStatement, saveCard } from '../actions';
import { ConfirmDelete, Empty, Field, Modal, PageHead, Swatches, Bar, ratio } from '../ui';
import { PALETTE } from '../icons';
import {
  cardStatements, cardUsed, categoryLabel, fmtDate, fmtMonth, level, money, moneyInput, monthShort, parseMoney,
  pct, today, uid, accountName,
} from '../lib';
import type { Card } from '../types';

const BADGE = { Paid: 'badge pos', Open: 'badge warn', Upcoming: 'badge', Due: 'badge bad' } as const;

export function Cards() {
  const s = useStore();
  const [sel, setSel] = useState(s.cards[0]?.id ?? '');
  const [cycle, setCycle] = useState<string>('');
  const [form, setForm] = useState<Card | 'new' | null>(null);
  const [del, setDel] = useState<Card | null>(null);
  const [pay, setPay] = useState(false);

  const card = s.cards.find(c => c.id === sel) ?? s.cards[0];
  const sts = card ? cardStatements(s, card) : [];
  const st = sts.find(x => x.key === cycle) ?? sts.find(x => x.status === 'Open') ?? sts[0];

  return (
    <>
      <PageHead sub={`${s.cards.length} card${s.cards.length === 1 ? '' : 's'}`} title="Credit cards">
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ New card</button>
      </PageHead>

      {!card ? <section className="card"><Empty>No credit cards yet.<button type="button" className="btn btn-1" onClick={() => setForm('new')}>Add a card</button></Empty></section> : <>
        <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
          {s.cards.map(c => {
            const used = cardUsed(s, c), p = pct(used, c.limit);
            return (
              <button key={c.id} type="button" className={'ccard' + (c.id === card.id ? ' sel' : '')} aria-pressed={c.id === card.id}
                style={{ background: c.color, color: '#fff' }} onClick={() => { setSel(c.id); setCycle(''); }}>
                <span className="spread" style={{ width: '100%' }}><b className="num" style={{ fontSize: 17 }}>{c.name}</b><span style={{ fontSize: 11, letterSpacing: '.08em', opacity: .85 }}>{c.network.toUpperCase()}</span></span>
                <span style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                  <span className="spread"><span style={{ fontSize: 13, opacity: .85 }}>Used</span><span className="num">{money(used)}</span></span>
                  <span className="bar" style={{ background: 'rgba(255,255,255,.25)' }}><i style={{ width: Math.min(100, p) + '%', background: '#fff' }} /></span>
                  <span style={{ fontSize: 12, opacity: .85 }}>Limit {money(c.limit)} · closes day {c.closeDay} · due day {c.dueDay}</span>
                </span>
              </button>);
          })}
        </div>

        <section className="card">
          <div className="card-head" style={{ flexWrap: 'wrap' }}>
            <h2>{card.name} · statements</h2>
            <div className="actions">
              <button type="button" className="btn-sm" onClick={() => setForm(card)}>Edit card</button>
              <button type="button" className="btn-sm danger" onClick={() => setDel(card)}>Delete</button>
            </div>
          </div>
          <div className="pills" role="tablist" aria-label="Statements">
            {sts.map(x => <button key={x.key} type="button" role="tab" aria-selected={x.key === st.key} className={'pillbtn' + (x.key === st.key ? ' on' : '')} onClick={() => setCycle(x.key)}>{monthShort(x.key)} {x.key.slice(2, 4)}</button>)}
          </div>
          {st && <>
            <div className="spread" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
              <div className="stack">
                <span className="muted" style={{ fontSize: 13 }}>{fmtMonth(st.key, true)} statement · {st.range}</span>
                <span className="num" style={{ fontSize: 28 }}>{money(st.total)}</span>
                <span className="muted" style={{ fontSize: 13 }}>Due {fmtDate(st.due)} · minimum {money(Math.round(st.total * 0.15))}{st.paid > 0 && st.status !== 'Paid' ? ` · paid ${money(st.paid)}` : ''}</span>
              </div>
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <span className={BADGE[st.status]}>{st.status}</span>
                {(st.status === 'Open' || st.status === 'Due') && st.total > st.paid &&
                  <button type="button" className="btn btn-1" onClick={() => setPay(true)}>Pay statement</button>}
              </div>
            </div>
            {st.items.length === 0 ? <Empty>No purchases in this statement.</Empty> : <div>
              {st.items.map(t => (
                <div className="line" key={t.id}>
                  <span className="muted" style={{ width: 54, fontSize: 13 }}>{fmtDate(t.date)}</span>
                  <span className="stack" style={{ flex: 1 }}><span style={{ fontWeight: 500 }}>{t.desc}{t.inst ? ` (${t.inst.i}/${t.inst.n})` : ''}</span>
                    <span className="muted" style={{ fontSize: 12 }}>{categoryLabel(s, t.categoryId)}</span></span>
                  <span className="num">{money(t.amount)}</span>
                </div>))}
            </div>}
          </>}
        </section>

        <section className="card">
          <h2>Limit</h2>
          {(() => { const used = cardUsed(s, card), p = pct(used, card.limit); return <>
            <Bar value={ratio(used, card.limit)} color={level(p)} />
            <div className="spread muted" style={{ fontSize: 13 }}><span>Used {money(used)} ({p}%)</span><span>Available {money(Math.max(0, card.limit - used))}</span></div>
            <span className="muted" style={{ fontSize: 13 }}>Includes future installments. Pays from {accountName(s, card.payAccountId)}.</span></>; })()}
        </section>
      </>}

      {form && <CardForm card={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={id => { setSel(id); setCycle(''); }} />}
      {del && <ConfirmDelete title={`Delete ${del.name}?`} cta="Delete card" onClose={() => setDel(null)}
        body={`This also deletes ${s.transactions.filter(t => t.accountId === del.id || t.toId === del.id).length} purchases and payments recorded on this card.`}
        onConfirm={() => { deleteCard(del.id); setSel(''); }} />}
      {pay && card && st && <PayModal card={card} label={fmtMonth(st.key)} remaining={st.total - st.paid} onClose={() => setPay(false)} />}
    </>
  );
}

function CardForm({ card, onClose, onSaved }: { card: Card | null; onClose: () => void; onSaved: (id: string) => void }) {
  const s = useStore();
  const [c, setC] = useState<Card>(card ?? { id: uid(), name: '', network: 'Mastercard', limit: 0, closeDay: 3, dueDay: 10, color: PALETTE[0][1], payAccountId: s.accounts[0]?.id ?? '' });
  const [limit, setLimit] = useState(card ? moneyInput(card.limit) : '');
  const [err, setErr] = useState('');
  const set = <K extends keyof Card>(k: K, v: Card[K]) => setC(x => ({ ...x, [k]: v }));
  const day = (v: string) => Math.min(31, Math.max(1, parseInt(v) || 1));
  const submit = () => {
    if (!c.name.trim()) return setErr('Give the card a name.');
    saveCard({ ...c, name: c.name.trim(), limit: parseMoney(limit) });
    onSaved(c.id); onClose();
  };
  return (
    <Modal title={card ? 'Edit credit card' : 'New credit card'} onClose={onClose}>
      <div className="grid">
        <Field label="Card name" error={err}>{id => <input id={id} placeholder="e.g. Nubank Platinum" value={c.name} autoFocus onChange={e => set('name', e.target.value)} />}</Field>
        <Field label="Network">{id => <select id={id} value={c.network} onChange={e => set('network', e.target.value)}>{['Mastercard', 'Visa', 'Elo', 'Amex', 'Other'].map(n => <option key={n}>{n}</option>)}</select>}</Field>
        <Field label="Credit limit">{id => <input id={id} inputMode="decimal" placeholder="R$ 0,00" value={limit} onChange={e => setLimit(e.target.value)} />}</Field>
        <Field label="Pays from account">{id => <select id={id} value={c.payAccountId} onChange={e => set('payAccountId', e.target.value)}><option value="">None</option>{s.accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}</Field>
        <Field label="Closing day">{id => <input id={id} type="number" min={1} max={31} value={c.closeDay} onChange={e => set('closeDay', day(e.target.value))} />}</Field>
        <Field label="Due day">{id => <input id={id} type="number" min={1} max={31} value={c.dueDay} onChange={e => set('dueDay', day(e.target.value))} />}</Field>
      </div>
      <div className="fld"><span className="lbl">Color</span><Swatches value={c.color} onChange={v => set('color', v)} /></div>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-1" onClick={submit}>{card ? 'Save changes' : 'Create card'}</button>
      </div>
    </Modal>
  );
}

function PayModal({ card, label, remaining, onClose }: { card: Card; label: string; remaining: number; onClose: () => void }) {
  const s = useStore();
  const [amt, setAmt] = useState(moneyInput(remaining));
  const [from, setFrom] = useState(card.payAccountId || s.accounts[0]?.id || '');
  const [date, setDate] = useState(today());
  const [err, setErr] = useState('');
  const submit = () => {
    const v = parseMoney(amt);
    if (!v) return setErr('Enter an amount.');
    if (!from) return setErr('Choose an account to pay from.');
    payStatement(card.id, from, v, date, label); onClose();
  };
  return (
    <Modal title={`Pay ${label} statement`} onClose={onClose}>
      <div className="grid">
        <Field label="Amount" error={err}>{id => <input id={id} inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} />}</Field>
        <Field label="From account">{id => <select id={id} value={from} onChange={e => setFrom(e.target.value)}>{s.accounts.filter(a => !a.archived).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}</Field>
        <Field label="Date">{id => <input id={id} type="date" value={date} onChange={e => setDate(e.target.value)} />}</Field>
      </div>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-1" onClick={submit}>Confirm payment</button>
      </div>
    </Modal>
  );
}

import { useState } from 'react';
import type { Card, Statement } from '../api/types';
import { QueryState } from '../components/QueryState';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { PALETTE } from '../icons';
import { useAccounts, useCards, useCreateCard, useDeleteCard, usePayCard, useUpdateCard } from '../queries';
import { useAccountLookup, useCategoryLookup } from '../queries/lookups';
import { Bar, ConfirmDelete, Field, level, Modal, PageHead, Swatches } from '../ui';

const BADGE = { paid: 'badge pos', open: 'badge warn', upcoming: 'badge', due: 'badge bad' } as const;
const NETWORKS = ['Mastercard', 'Visa', 'Elo', 'Amex', 'Other'];

export function Cards() {
  const { t, tOr, money, date, dateShort, month } = useI18n();
  const q = useCards();
  const acc = useAccountLookup();
  const cats = useCategoryLookup();
  const [sel, setSel] = useState('');
  const [cycle, setCycle] = useState('');
  const [form, setForm] = useState<Card | 'new' | null>(null);
  const [del, setDel] = useState<Card | null>(null);
  const [pay, setPay] = useState<{ card: Card; st: Statement } | null>(null);

  return (
    <>
      <PageHead sub={q.data ? t('cards.count', { n: q.data.length }) : ''} title={t('nav.cards')}>
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ {t('cards.new')}</button>
      </PageHead>
      <QueryState q={q} isEmpty={d => d.length === 0}
        empty={<>{t('cards.empty')}<button type="button" className="btn btn-1" onClick={() => setForm('new')}>{t('cards.add')}</button></>}>
        {cards => {
          const card = cards.find(c => c.id === sel) ?? cards[0];
          const st = card.statements.find(s => s.key === cycle) ?? card.statements.find(s => s.status === 'open') ?? card.statements[0];
          const usedPct = card.limit > 0 ? Math.round((card.used / card.limit) * 100) : 0;
          return (
            <>
              <div className="cols" style={{ gridTemplateColumns: 'repeat(auto-fill,minmax(280px,1fr))' }}>
                {cards.map(c => (
                  <button key={c.id} type="button" className={'ccard' + (c.id === card.id ? ' sel' : '')} aria-pressed={c.id === card.id}
                    style={{ background: c.color, color: '#fff' }} onClick={() => { setSel(c.id); setCycle(''); }}>
                    <span className="spread" style={{ width: '100%' }}><b className="num" style={{ fontSize: 17 }}>{c.name}</b><span style={{ fontSize: 11, letterSpacing: '.08em', opacity: 0.85 }}>{c.network.toUpperCase()}</span></span>
                    <span style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8 }}>
                      <span className="spread"><span style={{ fontSize: 13, opacity: 0.85 }}>{t('cards.used')}</span><span className="num">{money(c.used)}</span></span>
                      <span style={{ fontSize: 12, opacity: 0.85 }}>{t('cards.limitLine', { limit: money(c.limit), close: c.closeDay, due: c.dueDay })}</span>
                    </span>
                  </button>))}
              </div>

              <section className="card">
                <div className="card-head" style={{ flexWrap: 'wrap' }}>
                  <h2>{t('cards.statementsTitle', { name: card.name })}</h2>
                  <div className="actions">
                    <button type="button" className="btn-sm" onClick={() => setForm(card)}>{t('cards.editCard')}</button>
                    <button type="button" className="btn-sm danger" onClick={() => setDel(card)}>{t('common.delete')}</button>
                  </div>
                </div>
                <div className="pills" role="tablist">
                  {card.statements.map(s => (
                    <button key={s.key} type="button" role="tab" aria-selected={s.key === st.key} className={'pillbtn' + (s.key === st.key ? ' on' : '')} onClick={() => setCycle(s.key)}>{month(s.key)}</button>))}
                </div>
                <div className="spread" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
                  <div className="stack">
                    <span className="muted" style={{ fontSize: 13 }}>{t('cards.statementLine', { month: month(st.key, true), range: `${date(st.range.start)} – ${date(st.range.end)}` })}</span>
                    <span className="num" style={{ fontSize: 28 }}>{money(st.total)}</span>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {t('cards.due', { date: date(st.due) })}{st.paid > 0 && st.status !== 'paid' ? ` · ${t('cards.paidSoFar', { amount: money(st.paid) })}` : ''}
                    </span>
                  </div>
                  <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                    <span className={BADGE[st.status]}>{tOr(`status.statement.${st.status}`, st.status)}</span>
                    {(st.status === 'open' || st.status === 'due') && st.total > st.paid && (
                      <button type="button" className="btn btn-1" onClick={() => setPay({ card, st })}>{t('cards.pay')}</button>)}
                  </div>
                </div>
                {st.items.length === 0 ? <div className="empty">{t('cards.noPurchases')}</div> : (
                  <div>{st.items.map(i => (
                    <div className="line" key={i.id}>
                      <span className="muted" style={{ width: 54, fontSize: 13 }}>{dateShort(i.date)}</span>
                      <span className="stack" style={{ flex: 1 }}>
                        <span style={{ fontWeight: 500 }}>{i.desc}{i.inst ? ` (${i.inst.i}/${i.inst.n})` : ''}</span>
                        <span className="muted" style={{ fontSize: 12 }}>{cats.label(i.categoryId)}</span>
                      </span>
                      <span className="num">{money(i.amount)}</span>
                    </div>))}</div>)}
              </section>

              <section className="card">
                <h2>{t('cards.limitTitle')}</h2>
                <Bar value={usedPct} color={level(usedPct)} />
                <div className="spread muted" style={{ fontSize: 13 }}>
                  <span>{t('cards.limitUsed', { used: money(card.used), pct: usedPct })}</span>
                  <span>{t('cards.available', { amount: money(Math.max(0, card.limit - card.used)) })}</span>
                </div>
                <span className="muted" style={{ fontSize: 13 }}>{t('cards.limitNote', { account: acc.name(card.payAccountId) })}</span>
              </section>
            </>
          );
        }}
      </QueryState>

      {form && <CardForm card={form === 'new' ? null : form} onClose={() => setForm(null)} onSaved={id => { setSel(id); setCycle(''); }} />}
      {del && <DeleteCard card={del} onClose={() => setDel(null)} onDone={() => setSel('')} />}
      {pay && <PayModal card={pay.card} st={pay.st} onClose={() => setPay(null)} />}
    </>
  );
}

function CardForm({ card, onClose, onSaved }: { card: Card | null; onClose: () => void; onSaved: (id: string) => void }) {
  const { t, parseMoney, moneyInput } = useI18n();
  const accounts = useAccounts();
  const create = useCreateCard();
  const update = useUpdateCard();
  const [name, setName] = useState(card?.name ?? '');
  const [network, setNetwork] = useState(card?.network ?? 'Mastercard');
  const [limit, setLimit] = useState(card ? (card.limit === 0 ? '0' : moneyInput(card.limit)) : '');
  const [closeDay, setCloseDay] = useState(String(card?.closeDay ?? 3));
  const [dueDay, setDueDay] = useState(String(card?.dueDay ?? 10));
  const [payAccountId, setPayAccountId] = useState(card?.payAccountId ?? '');
  const [color, setColor] = useState(card?.color ?? PALETTE[0][1]);
  const [err, setErr] = useState('');
  const [limitErr, setLimitErr] = useState('');
  // days are kept as text while typing and clamped to 1..31 only on save
  const day = (v: string) => Math.min(31, Math.max(1, parseInt(v, 10) || 1));

  const save = async () => {
    setErr(''); setLimitErr('');
    if (!name.trim()) return setErr(t('cards.nameRequired'));
    const text = limit.trim();
    let cents = 0;
    if (text || card) {
      const parsed = text ? parseMoney(text) : null;
      if (parsed === null) return setLimitErr(t('common.invalidAmount'));
      cents = parsed;
    }
    const body = { name: name.trim(), network, limit: cents, closeDay: day(closeDay), dueDay: day(dueDay), color, payAccountId };
    try {
      const saved = card ? await update.mutateAsync({ id: card.id, body }) : await create.mutateAsync(body);
      onSaved(saved?.id ?? card?.id ?? '');
      onClose();
    } catch (e) { setErr(errorMessage(e, t)); }
  };

  return (
    <Modal title={card ? t('cards.formEdit') : t('cards.new')} onClose={onClose}>
      <div className="grid">
        <Field label={t('cards.name')} error={err}>{id => <input id={id} placeholder={t('cards.namePh')} value={name} autoFocus onChange={e => setName(e.target.value)} />}</Field>
        <Field label={t('cards.network')}>{id => <select id={id} value={network} onChange={e => setNetwork(e.target.value)}>{NETWORKS.map(n => <option key={n}>{n}</option>)}</select>}</Field>
        <Field label={t('cards.limit')} error={limitErr}>{id => <input id={id} inputMode="decimal" value={limit} onChange={e => setLimit(e.target.value)} />}</Field>
        <Field label={t('cards.payFrom')}>{id => (
          <select id={id} value={payAccountId} onChange={e => setPayAccountId(e.target.value)}>
            <option value="">{t('common.none')}</option>{(accounts.data ?? []).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>)}</Field>
        <Field label={t('cards.closeDay')}>{id => <input id={id} type="number" min={1} max={31} value={closeDay} onChange={e => setCloseDay(e.target.value)} />}</Field>
        <Field label={t('cards.dueDay')}>{id => <input id={id} type="number" min={1} max={31} value={dueDay} onChange={e => setDueDay(e.target.value)} />}</Field>
      </div>
      <div className="fld"><span className="lbl">{t('common.color')}</span><Swatches value={color} onChange={setColor} /></div>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" onClick={() => void save()}>{card ? t('common.saveChanges') : t('cards.createCta')}</button>
      </div>
    </Modal>
  );
}

function DeleteCard({ card, onClose, onDone }: { card: Card; onClose: () => void; onDone: () => void }) {
  const { t } = useI18n();
  const del = useDeleteCard();
  return (
    <ConfirmDelete title={t('cards.deleteTitle', { name: card.name })} body={t('cards.deleteBody')} cta={t('cards.deleteCta')} onClose={onClose}
      onConfirm={async () => { await del.mutateAsync(card.id); onDone(); }} />
  );
}

function PayModal({ card, st, onClose }: { card: Card; st: Statement; onClose: () => void }) {
  const { t, month, today, parseMoney, moneyInput } = useI18n();
  const accounts = useAccounts();
  const pay = usePayCard();
  const list = accounts.data ?? [];
  const [amt, setAmt] = useState(moneyInput(st.total - st.paid));
  const [from, setFrom] = useState(card.payAccountId || list[0]?.id || '');
  const [dt, setDt] = useState(today);
  const [err, setErr] = useState('');

  const submit = async () => {
    const amount = parseMoney(amt);
    if (amt.trim() && amount === null) return setErr(t('common.invalidAmount'));
    if (!amount) return setErr(t('cards.amountRequired'));
    if (!from) return setErr(t('cards.payNeedAccount'));
    try { await pay.mutateAsync({ id: card.id, body: { amount, fromAccountId: from, date: dt } }); onClose(); } catch (e) { setErr(errorMessage(e, t)); }
  };
  return (
    <Modal title={t('cards.payTitle', { month: month(st.key) })} onClose={onClose}>
      <div className="grid">
        <Field label={t('cards.payAmount')} error={err}>{id => <input id={id} inputMode="decimal" value={amt} onChange={e => setAmt(e.target.value)} />}</Field>
        <Field label={t('cards.payAccount')}>{id => <select id={id} value={from} onChange={e => setFrom(e.target.value)}>{list.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>}</Field>
        <Field label={t('common.date')}>{id => <input id={id} type="date" value={dt} onChange={e => setDt(e.target.value)} />}</Field>
      </div>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" onClick={() => void submit()}>{t('cards.payConfirm')}</button>
      </div>
    </Modal>
  );
}

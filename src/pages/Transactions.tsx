import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import type { Account, Card, DeleteScope, Repeat, Tx, TxFilters, TxInput, TxType } from '../api/types';
import { useAuth } from '../auth/AuthProvider';
import { QueryState } from '../components/QueryState';
import { amountColor, signedAmount } from '../components/txFormat';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { shiftMonth } from '../i18n/format';
import { txTitle } from '../i18n/txTitle';
import {
  useAccounts, useCards, useCategories, useCreateTransactions, useDeleteTransaction, useTransactions, useUpdateTransaction, useUploadReceipt,
} from '../queries';
import { useAccountLookup, useCategoryLookup } from '../queries/lookups';
import { ConfirmDelete, Field, Modal, OptionRadio, PageHead } from '../ui';

const TYPES: TxType[] = ['expense', 'income', 'transfer'];

export function Transactions() {
  const { t, tOr, money, date, dateShort, month, today } = useI18n();
  const cats = useCategoryLookup();
  const acc = useAccountLookup();
  const [form, setForm] = useState<Tx | 'new' | null>(null);
  const [del, setDel] = useState<Tx | null>(null);
  const [text, setText] = useState('');
  const q = useDeferredValue(text);
  const [mon, setMon] = useState(today.slice(0, 7)); // '' = all time
  const [account, setAccount] = useState('');
  const [category, setCategory] = useState('');
  const [type, setType] = useState('');
  const [tag, setTag] = useState('');

  // The mobile "+" button links to #/transactions?new
  useEffect(() => {
    const check = () => { if (location.hash.includes('?new')) { history.replaceState(null, '', '#/transactions'); setForm('new'); } };
    check();
    addEventListener('hashchange', check);
    return () => removeEventListener('hashchange', check);
  }, []);

  const filters = useMemo<TxFilters>(() => {
    const f: TxFilters = {};
    if (mon) f.month = mon;
    if (account) f.account = account;
    if (category) f.category = category;
    if (type) f.type = type as TxType;
    const tg = tag.trim();
    if (tg) f.tag = tg.startsWith('#') ? tg : `#${tg}`;
    if (q.trim()) f.q = q.trim();
    return f;
  }, [mon, account, category, type, tag, q]);
  const list = useTransactions(filters);
  const hasFilters = Object.keys(filters).some(k => k !== 'month');

  const subText = (x: Tx) => {
    const bits: string[] = [];
    if (x.inst) bits.push(t('tx.installment', { i: x.inst.i, n: x.inst.n }));
    if (x.repeat) bits.push(t('tx.repeats', { freq: tOr(`tx.repeat.${x.repeat}`, x.repeat) }));
    if (x.date > today) bits.push(t('tx.scheduled'));
    return bits.join(' · ');
  };

  return (
    <>
      <PageHead sub={list.data ? t('tx.sub', { period: mon ? month(mon, true) : t('tx.allTime'), n: list.data.items.length }) : ''} title={t('nav.transactions')}>
        <div className="month-nav">
          <button type="button" className="btn-sm" aria-label={t('month.prev')} disabled={!mon} onClick={() => setMon(shiftMonth(mon, -1))}>‹</button>
          <button type="button" className="btn-sm" aria-label={t('month.next')} disabled={!mon} onClick={() => setMon(shiftMonth(mon, 1))}>›</button>
          <button type="button" className="btn-sm" aria-pressed={!mon} style={{ width: 'auto', padding: '0 12px' }} onClick={() => setMon(mon ? '' : today.slice(0, 7))}>{t('tx.allTime')}</button>
        </div>
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ {t('nav.newTransaction')}</button>
      </PageHead>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
        <label htmlFor="tx-q" className="sr">{t('tx.search')}</label>
        <input id="tx-q" className="flt" placeholder={t('tx.search')} style={{ flex: '1 1 220px' }} value={text} onChange={e => setText(e.target.value)} />
        <select className="flt" aria-label={t('tx.col.account')} value={account} onChange={e => setAccount(e.target.value)}>
          <option value="">{t('tx.allAccounts')}</option>{[...acc.accounts, ...acc.cards].map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
        <select className="flt" aria-label={t('tx.col.category')} value={category} onChange={e => setCategory(e.target.value)}>
          <option value="">{t('tx.allCategories')}</option>{cats.tops.map(c => <option key={c.id} value={c.id}>{cats.name(c)}</option>)}
        </select>
        <select className="flt" aria-label={t('common.type')} value={type} onChange={e => setType(e.target.value)}>
          <option value="">{t('tx.allTypes')}</option>{TYPES.map(k => <option key={k} value={k}>{tOr(`txtype.${k}`, k)}</option>)}
        </select>
        <input className="flt" aria-label={t('tx.tagFilter')} placeholder={t('tx.tagFilter')} value={tag} onChange={e => setTag(e.target.value)} />
      </div>

      <QueryState q={list} isEmpty={d => d.items.length === 0}
        empty={<>{hasFilters ? t('tx.noMatch') : t('tx.empty')}{!hasFilters && <button type="button" className="btn btn-1" onClick={() => setForm('new')}>{t('tx.addFirst')}</button>}</>}>
        {({ items, totals }) => (
          <>
            <div className="kpis" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              <div className="card kpi" style={{ padding: 16, gap: 4 }}><span className="lbl">{t('tx.income')}</span><span className="num" style={{ fontSize: 20, color: 'var(--pos)' }}>+ {money(totals.income)}</span></div>
              <div className="card kpi" style={{ padding: 16, gap: 4 }}><span className="lbl">{t('tx.expenses')}</span><span className="num" style={{ fontSize: 20, color: 'var(--neg)' }}>− {money(totals.expense)}</span></div>
              <div className="card kpi" style={{ padding: 16, gap: 4 }}><span className="lbl">{t('tx.net')}</span><span className="num" style={{ fontSize: 20 }}>{money(totals.net)}</span></div>
            </div>
            <section className="card" style={{ padding: '6px 20px 10px' }}>
              <div className="scroll">
                <div className="trow thead tx-cols">
                  <span className="th">{t('tx.col.date')}</span><span className="th">{t('tx.col.description')}</span><span className="th hide-m">{t('tx.col.category')}</span>
                  <span className="th hide-m">{t('tx.col.account')}</span><span className="th hide-m">{t('tx.col.tags')}</span><span className="th r">{t('tx.col.amount')}</span><span className="th r">{t('tx.col.actions')}</span>
                </div>
                {items.map(x => (
                  <div className="trow tx-cols" key={x.id}>
                    <span className="muted hide-m" style={{ fontSize: 13 }}>{dateShort(x.date)}</span>
                    <span className="stack">
                      <span style={{ fontWeight: 500 }}>{txTitle(t, x)}</span>
                      <span className="muted" style={{ fontSize: 12 }}>
                        <span className="hide-d">{date(x.date)} · </span>{subText(x)}
                        {x.receiptUrl && <> {subText(x) ? '· ' : ''}<a href={x.receiptUrl} target="_blank" rel="noreferrer">{t('tx.receiptView')}</a></>}
                      </span>
                    </span>
                    <span className="hide-m" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {x.type !== 'transfer' && <span className="dot" style={{ background: cats.color(x.categoryId) }} />}{x.type === 'transfer' ? t('txtype.transfer') : cats.label(x.categoryId)}
                    </span>
                    <span className="hide-m" style={{ color: 'var(--ink-2)' }}>{x.type === 'transfer' ? `${acc.name(x.accountId)} → ${acc.name(x.toId)}` : acc.name(x.accountId)}</span>
                    <span className="hide-m" style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>{x.tags.map(g => <span className="tag" key={g}>{g}</span>)}</span>
                    <span className="num r" style={{ color: amountColor(x.type) }}>{signedAmount(x, money)}</span>
                    <span className="actions-c" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      {!x.source && <button type="button" className="btn-sm" onClick={() => setForm(x)}>{t('common.edit')}</button>}
                      <button type="button" className="btn-sm danger" onClick={() => setDel(x)}>{t('common.delete')}</button>
                    </span>
                  </div>))}
              </div>
            </section>
          </>
        )}
      </QueryState>

      {form && <TxDialog tx={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {del && <DeleteTx tx={del} onClose={() => setDel(null)} />}
    </>
  );
}

/**
 * The dialog stays mounted while the lists it needs load; it distinguishes loading, failure (+ retry),
 * "no accounts yet" and the form itself, so opening it never blocks silently.
 */
function TxDialog({ tx, onClose }: { tx: Tx | null; onClose: () => void }) {
  const { t, tOr } = useI18n();
  const accounts = useAccounts();
  const cards = useCards();
  const categories = useCategories();
  const [type, setType] = useState<TxType>(tx?.type ?? 'expense');

  // A failed background refetch keeps the cached lists, so only a failure without data blocks the form.
  const failed = [accounts, cards, categories].filter(q => q.isError && q.data === undefined);
  const empty = accounts.isSuccess && cards.isSuccess && accounts.data.length + cards.data.length === 0;
  const state = failed.length ? 'error' : accounts.isPending || cards.isPending ? 'loading' : empty ? 'empty' : categories.isPending ? 'loading' : 'ready';

  if (state === 'empty') {
    return (
      <Modal title={t('tx.addAccountFirst')} onClose={onClose}>
        <p style={{ margin: 0, lineHeight: 1.5 }}>{t('tx.addAccountBody')}</p>
        <div className="footer"><a className="btn btn-1" href="#/accounts" onClick={onClose} style={{ color: '#fff' }}>{t('tx.goAccounts')}</a></div>
      </Modal>
    );
  }
  return (
    <Modal wide title={tx ? t('tx.formEdit') : t('nav.newTransaction')} onClose={onClose}
      extra={state === 'ready' && <div className="seg">{TYPES.map(k => (
        <button key={k} type="button" className={type === k ? 'on' : ''} aria-pressed={type === k} onClick={() => setType(k)}>{tOr(`txtype.${k}`, k)}</button>))}</div>}>
      {state === 'loading' && <div className="empty" role="status">{t('common.loading')}</div>}
      {state === 'error' && (
        <div className="empty" role="alert">
          {errorMessage(failed[0].error, t)}
          <button type="button" className="btn btn-2" onClick={() => failed.forEach(q => void q.refetch())}>{t('common.retry')}</button>
        </div>)}
      {state === 'ready' && accounts.data && cards.data && (
        <TxForm tx={tx} type={type} accounts={accounts.data} cards={cards.data} onClose={onClose} />)}
    </Modal>
  );
}

type Errs = { amount?: string; date?: string; desc?: string; account?: string; to?: string; general?: string };

function TxForm({ tx, type, accounts, cards, onClose }: { tx: Tx | null; type: TxType; accounts: Account[]; cards: Card[]; onClose: () => void }) {
  const { t, today, money, parseMoney, moneyInput } = useI18n();
  const { devMode } = useAuth();
  const cats = useCategoryLookup();
  const create = useCreateTransactions();
  const update = useUpdateTransaction();
  const upload = useUploadReceipt();

  const [amount, setAmount] = useState(tx ? moneyInput(tx.amount) : '');
  const [dt, setDt] = useState(tx?.date ?? today);
  const [accountChoice, setAccountChoice] = useState<string | null>(null);
  const [toChoice, setToChoice] = useState<string | null>(null);
  const [desc, setDesc] = useState(tx?.desc ?? '');
  const [parentChoice, setParentChoice] = useState<string | null>(null);
  const [subChoice, setSubChoice] = useState<string | null>(null);
  const [tagsText, setTagsText] = useState(tx?.tags.join(', ') ?? '');
  const [repeat, setRepeat] = useState<Repeat | ''>(tx?.repeat ?? '');
  const [inst, setInst] = useState(false);
  const [n, setN] = useState(3);
  const [note, setNote] = useState(tx?.note ?? '');
  const [file, setFile] = useState<File | null>(null);
  const [saved, setSaved] = useState<Tx | null>(null);
  const [errs, setErrs] = useState<Errs>({});
  const [busy, setBusy] = useState(false);

  // Options: non-archived accounts (+ cards for expenses), plus the edited transaction's own archived
  // account so that editing never silently moves it. Selected values always resolve to a listed option.
  const keep = (a: Account, id?: string) => !a.archived || (!!tx && a.id === id);
  const fromAccounts = accounts.filter(a => keep(a, tx?.accountId));
  const fromCards = type === 'expense' ? cards : [];
  const fromIds = [...fromAccounts, ...fromCards].map(x => x.id);
  const wantedFrom = accountChoice ?? tx?.accountId ?? '';
  const accountId = fromIds.includes(wantedFrom) ? wantedFrom : (fromIds[0] ?? '');

  const toAccounts = accounts.filter(a => keep(a, tx?.toId) && a.id !== accountId);
  const toIds = [...toAccounts, ...cards].map(x => x.id);
  const wantedTo = toChoice ?? tx?.toId ?? '';
  const toId = toIds.includes(wantedTo) ? wantedTo : '';

  const initialCat = tx?.categoryId ? cats.categories.find(c => c.id === tx.categoryId) : undefined;
  const wantedParent = parentChoice ?? (initialCat ? (initialCat.parentId ?? initialCat.id) : '');
  const parent = cats.tops.some(c => c.id === wantedParent) ? wantedParent : '';
  const subs = parent ? cats.subsOf(parent) : [];
  const wantedSub = subChoice ?? (initialCat?.parentId ? initialCat.id : '');
  const sub = subs.some(c => c.id === wantedSub) ? wantedSub : '';

  const preview = parseMoney(amount) ?? 0; // display only (installment hint)
  const instOn = inst && type === 'expense' && !tx;
  const color = amountColor(type);

  const reset = () => { setAmount(''); setDesc(''); setTagsText(''); setNote(''); setFile(null); setSaved(null); setErrs({}); };

  const validate = (): { body: TxInput } | { errs: Errs } => {
    const e: Errs = {};
    const cents = amount.trim() === '' ? 0 : parseMoney(amount);
    if (cents === null) e.amount = t('common.invalidAmount');
    else if (cents === 0) e.amount = t('tx.amountRequired');
    if (!dt) e.date = t('tx.dateRequired');
    if (!desc.trim()) e.desc = t('tx.descRequired');
    if (!accountId) e.account = t('tx.accountRequired');
    if (type === 'transfer' && (!toId || toId === accountId)) e.to = t('tx.pickTwo');
    if (Object.keys(e).length || !cents) return { errs: e };
    return {
      body: {
        type, amount: cents, date: dt, desc: desc.trim(), accountId,
        toId: type === 'transfer' ? toId : undefined,
        categoryId: type === 'transfer' ? undefined : (sub || parent || undefined),
        tags: tagsText.split(/[,\s]+/).filter(Boolean).map(g => (g.startsWith('#') ? g : `#${g}`)),
        note: note.trim(),
      },
    };
  };

  const save = async (another: boolean) => {
    if (busy) return;
    let target = saved;
    if (!target) {
      const v = validate();
      if ('errs' in v) return setErrs(v.errs);
      setErrs({});
      setBusy(true);
      try {
        if (tx) target = await update.mutateAsync({ id: tx.id, body: v.body });
        else target = (await create.mutateAsync({ ...v.body, ...(instOn ? { installments: n } : repeat ? { repeat } : {}) }))[0];
        setSaved(target);
      } catch (e) {
        setBusy(false);
        return setErrs({ general: errorMessage(e, t) });
      }
    }
    setErrs({});
    setBusy(true);
    if (file && !devMode && target) {
      try { await upload.mutateAsync({ txId: target.id, file }); } catch {
        setBusy(false);
        return setErrs({ general: t('tx.receiptFail') });
      }
    }
    setBusy(false);
    if (another && !tx) reset(); else onClose();
  };

  const Opts = ({ items }: { items: { id: string; name: string }[] }) => <>{items.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</>;

  return (
    <>
      <div className="grid">
        <Field label={t('common.amount')} error={errs.amount}>{id => <input id={id} inputMode="decimal" value={amount} autoFocus onChange={e => setAmount(e.target.value)}
          style={{ fontFamily: "'Space Grotesk',sans-serif", fontWeight: 600, fontSize: 18, color }} />}</Field>
        <Field label={t('common.date')} error={errs.date}>{id => <input id={id} type="date" value={dt} onChange={e => setDt(e.target.value)} />}</Field>
        <Field label={type === 'transfer' ? t('tx.from') : type === 'income' ? t('tx.accountOnly') : t('tx.account')} error={errs.account}>{id => (
          <select id={id} value={accountId} onChange={e => setAccountChoice(e.target.value)}>
            {!accountId && <option value="">{t('tx.select')}</option>}
            {type === 'expense' ? <>
              <optgroup label={t('tx.groupAccounts')}><Opts items={fromAccounts} /></optgroup>
              {fromCards.length > 0 && <optgroup label={t('tx.groupCards')}><Opts items={fromCards} /></optgroup>}</> : <Opts items={fromAccounts} />}
          </select>)}</Field>
        {type === 'transfer' && <Field label={t('tx.to')} error={errs.to}>{id => (
          <select id={id} value={toId} onChange={e => setToChoice(e.target.value)}>
            <option value="">{t('tx.select')}</option>
            <optgroup label={t('tx.groupAccounts')}><Opts items={toAccounts} /></optgroup>
            {cards.length > 0 && <optgroup label={t('tx.groupCardsPay')}><Opts items={cards} /></optgroup>}
          </select>)}</Field>}
      </div>
      <div className="grid">
        <Field label={t('tx.description')} error={errs.desc}>{id => <input id={id} placeholder={t('tx.descPh')} value={desc} onChange={e => setDesc(e.target.value)} />}</Field>
        {type !== 'transfer' && <>
          <Field label={t('tx.category')}>{id => (
            <select id={id} value={parent} onChange={e => { setParentChoice(e.target.value); setSubChoice(''); }}>
              <option value="">{t('tx.selectCategory')}</option>{cats.tops.map(c => <option key={c.id} value={c.id}>{cats.name(c)}</option>)}
            </select>)}</Field>
          <Field label={t('tx.subcategory')}>{id => (
            <select id={id} value={sub} onChange={e => setSubChoice(e.target.value)} disabled={!subs.length}>
              <option value="">{t('common.none')}</option>{subs.map(c => <option key={c.id} value={c.id}>{cats.name(c)}</option>)}
            </select>)}</Field></>}
      </div>
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        <Field label={t('tx.tags')}>{id => <input id={id} placeholder={t('tx.tagsPh')} value={tagsText} onChange={e => setTagsText(e.target.value)} />}</Field>
        {!tx && <Field label={t('tx.repeatLabel')}>{id => (
          <select id={id} value={instOn ? '' : repeat} disabled={instOn} onChange={e => setRepeat(e.target.value as Repeat | '')}>
            <option value="">{t('tx.repeatNever')}</option><option value="weekly">{t('tx.repeatWeekly')}</option><option value="monthly">{t('tx.repeatMonthly')}</option><option value="yearly">{t('tx.repeatYearly')}</option>
          </select>)}</Field>}
      </div>
      {type === 'expense' && !tx && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center', padding: 14, borderRadius: 14, background: 'var(--bg)' }}>
          <label className="check" style={{ fontWeight: 500 }}><input type="checkbox" checked={inst} onChange={e => setInst(e.target.checked)} />{t('tx.split')}</label>
          {instOn && <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button type="button" className="btn-sm" aria-label={t('tx.fewer')} style={{ width: 40, height: 40 }} onClick={() => setN(Math.max(2, n - 1))}>−</button>
              <span className="num" style={{ width: 44, textAlign: 'center', fontSize: 17 }}>{n}x</span>
              <button type="button" className="btn-sm" aria-label={t('tx.more')} style={{ width: 40, height: 40 }} onClick={() => setN(Math.min(24, n + 1))}>+</button>
            </div>
            <span className="muted" style={{ fontSize: 13 }}>{t('tx.installHint', { n, amount: money(Math.floor(preview / n)) })}</span></>}
        </div>)}
      {tx && (tx.inst || tx.repeat) && <span className="muted" style={{ fontSize: 13 }}>{t('tx.seriesNote')}</span>}
      <div className="grid" style={{ gridTemplateColumns: 'repeat(auto-fit,minmax(240px,1fr))' }}>
        <Field label={t('common.notes')}>{id => <textarea id={id} placeholder={t('common.optional')} value={note} onChange={e => setNote(e.target.value)} />}</Field>
        <div className="fld"><span className="lbl">{t('tx.receipt')}</span>
          <label className="drop" style={devMode ? { opacity: 0.6, cursor: 'not-allowed' } : undefined}>
            {file ? file.name : t('tx.receiptDrop')}
            <input type="file" accept="image/jpeg,image/png,image/webp" className="sr" disabled={devMode} aria-label={t('tx.receiptDrop')} onChange={e => setFile(e.target.files?.[0] ?? null)} />
          </label>
          {devMode && <span className="muted" style={{ fontSize: 12 }}>{t('tx.receiptDev')}</span>}
        </div>
      </div>
      {errs.general && <p className="err" role="alert" style={{ margin: 0 }}>{errs.general}</p>}
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        {!tx && <button type="button" className="btn btn-2" disabled={busy} onClick={() => void save(true)}>{t('tx.saveAnother')}</button>}
        <button type="button" className="btn btn-1" disabled={busy} onClick={() => void save(false)}>{tx ? t('common.saveChanges') : t('common.save')}</button>
      </div>
    </>
  );
}

function DeleteTx({ tx, onClose }: { tx: Tx; onClose: () => void }) {
  const { t, money, date } = useI18n();
  const del = useDeleteTransaction();
  const [scope, setScope] = useState<DeleteScope>('one');
  return (
    <ConfirmDelete title={t('tx.deleteTitle', { desc: tx.desc })} body={t('tx.deleteBody', { amount: money(tx.amount), date: date(tx.date) })} cta={t('common.delete')} onClose={onClose}
      onConfirm={() => del.mutateAsync({ id: tx.id, scope })}>
      {tx.groupId && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <OptionRadio name="scope" checked={scope === 'one'} onChange={() => setScope('one')}>{t('tx.scopeOne')}</OptionRadio>
          <OptionRadio name="scope" checked={scope === 'future'} onChange={() => setScope('future')}>{t('tx.scopeFuture')}</OptionRadio>
          <OptionRadio name="scope" checked={scope === 'all'} onChange={() => setScope('all')}>{tx.inst ? t('tx.scopeAllInst', { n: tx.inst.n }) : t('tx.scopeAllRepeat')}</OptionRadio>
        </div>)}
    </ConfirmDelete>
  );
}

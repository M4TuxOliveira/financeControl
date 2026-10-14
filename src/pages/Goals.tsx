import { useState } from 'react';
import type { Goal } from '../api/types';
import { QueryState } from '../components/QueryState';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { useAccounts, useContributeGoal, useCreateGoal, useDeleteGoal, useGoals, useUpdateGoal } from '../queries';
import { useAccountLookup } from '../queries/lookups';
import { Bar, ConfirmDelete, Field, Modal, PageHead } from '../ui';

export function Goals() {
  const { t, money, month } = useI18n();
  const q = useGoals();
  const acc = useAccountLookup();
  const delMut = useDeleteGoal();
  const [form, setForm] = useState<Goal | 'new' | null>(null);
  const [add, setAdd] = useState<Goal | null>(null);
  const [del, setDel] = useState<Goal | null>(null);

  const progress = (g: Goal): string => {
    if (g.left === 0) return t('goals.reached');
    if (!g.targetDate) return t('goals.toGo', { amount: money(g.left) });
    if (g.monthlyNeeded === null || g.monthsLeft === 0) return t('goals.dateReached');
    return t('goals.perMonth', { amount: money(g.monthlyNeeded), n: g.monthsLeft });
  };

  return (
    <>
      <PageHead sub={q.data ? t('goals.count', { n: q.data.length }) : ''} title={t('nav.goals')}>
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ {t('goals.new')}</button>
      </PageHead>
      <QueryState q={q} isEmpty={d => d.length === 0}
        empty={<>{t('goals.empty')}<button type="button" className="btn btn-1" onClick={() => setForm('new')}>{t('goals.set')}</button></>}>
        {list => {
          const saved = list.reduce((n, g) => n + g.saved, 0);
          const target = list.reduce((n, g) => n + g.target, 0);
          return (
            <>
              <div className="kpis">
                <div className="hero">
                  <span className="lbl">{t('goals.savedSoFar')}</span><span className="num" style={{ fontSize: 26 }}>{money(saved)}</span>
                  <span style={{ fontSize: 13, color: '#B9BEC6' }}>{t('goals.ofTarget', { target: money(target), pct: target > 0 ? Math.round((saved / target) * 100) : 0 })}</span>
                </div>
              </div>
              <div className="cols">
                {list.map(g => (
                  <section className="card" key={g.id}>
                    <div className="spread"><h2>{g.name}</h2><span className="num">{g.pct}%</span></div>
                    <Bar value={g.pct} color="var(--pos)" />
                    <div className="spread muted" style={{ fontSize: 13 }}>
                      <span>{money(g.saved)} / {money(g.target)}</span>
                      <span>{g.targetDate ? month(g.targetDate) : t('goals.noDate')}</span>
                    </div>
                    <span className="muted" style={{ fontSize: 13 }}>
                      {progress(g)}{g.accountId ? ` · ${t('goals.inAccount', { account: acc.name(g.accountId) })}` : ''}
                    </span>
                    <div className="actions">
                      <button type="button" className="btn-sm" onClick={() => setAdd(g)}>{t('goals.addMoney')}</button>
                      <button type="button" className="btn-sm" onClick={() => setForm(g)}>{t('common.edit')}</button>
                      <button type="button" className="btn-sm danger" onClick={() => setDel(g)}>{t('common.delete')}</button>
                    </div>
                  </section>))}
              </div>
            </>
          );
        }}
      </QueryState>
      {form && <GoalForm goal={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {add && <AddMoney goal={add} onClose={() => setAdd(null)} />}
      {del && <ConfirmDelete title={t('goals.deleteTitle', { name: del.name })} body={t('goals.deleteBody')} cta={t('goals.deleteCta')} onClose={() => setDel(null)}
        onConfirm={() => delMut.mutateAsync(del.id)} />}
    </>
  );
}

type Errs = { name?: string; target?: string; saved?: string; server?: string };

function GoalForm({ goal, onClose }: { goal: Goal | null; onClose: () => void }) {
  const { t, parseMoney, moneyInput } = useI18n();
  const accounts = useAccounts();
  const create = useCreateGoal();
  const update = useUpdateGoal();
  const [name, setName] = useState(goal?.name ?? '');
  const [accountChoice, setAccountChoice] = useState<string | null>(null);
  const [target, setTarget] = useState(goal ? moneyInput(goal.target) : '');
  const [targetDate, setTargetDate] = useState(goal?.targetDate ?? '');
  const [saved, setSaved] = useState(goal ? (goal.saved === 0 ? '0' : moneyInput(goal.saved)) : '');
  const [errs, setErrs] = useState<Errs>({});

  const listed = (accounts.data ?? []).filter(a => !a.archived);
  const wanted = accountChoice ?? goal?.accountId ?? '';
  const accountId = listed.some(a => a.id === wanted) ? wanted : '';

  const blocked = accounts.isPending || (accounts.isError && !!goal?.accountId);

  const save = async () => {
    if (blocked) return;
    if (!name.trim()) return setErrs({ name: t('goals.nameRequired') });
    const tgt = parseMoney(target);
    if (!tgt) return setErrs({ target: t('goals.targetRequired') });
    let sv = 0;
    if (saved.trim() !== '' || goal) {
      const p = parseMoney(saved);
      if (p === null) return setErrs({ saved: t('common.invalidAmount') });
      sv = p;
    }
    setErrs({});
    const body = { name: name.trim(), accountId, target: tgt, targetDate, saved: sv };
    try { await (goal ? update.mutateAsync({ id: goal.id, body }) : create.mutateAsync(body)); onClose(); } catch (e) { setErrs({ server: errorMessage(e, t) }); }
  };

  return (
    <Modal title={goal ? t('goals.formEdit') : t('goals.new')} onClose={onClose}>
      <div className="grid">
        <Field label={t('goals.name')} error={errs.name}>{id => <input id={id} placeholder={t('goals.namePh')} value={name} autoFocus onChange={e => setName(e.target.value)} />}</Field>
        <Field label={t('goals.account')}>{id => (
          <select id={id} value={accountId} onChange={e => setAccountChoice(e.target.value)}>
            <option value="">{t('common.none')}</option>{listed.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>)}</Field>
        {accounts.isError && <div className="fld">
          <span className="err" role="alert">{errorMessage(accounts.error, t)}</span>
          <button type="button" className="btn btn-2" onClick={() => void accounts.refetch()}>{t('common.retry')}</button>
        </div>}
        <Field label={t('goals.target')} error={errs.target}>{id => <input id={id} inputMode="decimal" value={target} onChange={e => setTarget(e.target.value)} />}</Field>
        <Field label={t('goals.targetMonth')}>{id => <input id={id} type="month" value={targetDate} onChange={e => setTargetDate(e.target.value)} />}</Field>
        <Field label={t('goals.alreadySaved')} error={errs.saved}>{id => <input id={id} inputMode="decimal" value={saved} onChange={e => setSaved(e.target.value)} />}</Field>
      </div>
      {errs.server && <p className="err" role="alert" style={{ margin: 0 }}>{errs.server}</p>}
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" disabled={blocked} onClick={() => void save()}>{goal ? t('common.saveChanges') : t('goals.createCta')}</button>
      </div>
    </Modal>
  );
}

function AddMoney({ goal, onClose }: { goal: Goal; onClose: () => void }) {
  const { t, parseMoney } = useI18n();
  const accounts = useAccounts();
  const contribute = useContributeGoal();
  const acc = useAccountLookup();
  const list = (accounts.data ?? []).filter(a => !a.archived);
  const [amt, setAmt] = useState('');
  const [choice, setChoice] = useState<string | null>(null);
  const [err, setErr] = useState('');

  const fallback = list.find(a => a.id !== goal.accountId)?.id ?? list.find(a => a.id === goal.accountId)?.id ?? '';
  const from = choice !== null && list.some(a => a.id === choice) ? choice : fallback;

  const submit = async () => {
    if (amt.trim() === '') return setErr(t('cards.amountRequired'));
    const amount = parseMoney(amt);
    if (amount === null) return setErr(t('common.invalidAmount'));
    if (amount === 0) return setErr(t('cards.amountRequired'));
    if (!accounts.data) return;
    if (!from) return setErr(t('goals.needAccount'));
    try { await contribute.mutateAsync({ id: goal.id, body: { amount, fromAccountId: from } }); onClose(); } catch (e) { setErr(errorMessage(e, t)); }
  };

  return (
    <Modal title={t('goals.addTitle', { name: goal.name })} onClose={onClose}>
      <div className="grid">
        <Field label={t('common.amount')} error={err}>{id => <input id={id} inputMode="decimal" value={amt} autoFocus onChange={e => setAmt(e.target.value)} />}</Field>
        <Field label={t('goals.fromAccount')}>{id => (
          <select id={id} value={from} onChange={e => setChoice(e.target.value)}>
            {list.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>)}</Field>
      </div>
      {accounts.isError && <div className="fld">
        <span className="err" role="alert">{errorMessage(accounts.error, t)}</span>
        <button type="button" className="btn btn-2" onClick={() => void accounts.refetch()}>{t('common.retry')}</button>
      </div>}
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>
        {from && goal.accountId && from !== goal.accountId ? t('goals.noteTransfer', { account: acc.name(goal.accountId) }) : t('goals.noteLocal')}
      </p>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" disabled={!accounts.data} onClick={() => void submit()}>{t('goals.addCta')}</button>
      </div>
    </Modal>
  );
}

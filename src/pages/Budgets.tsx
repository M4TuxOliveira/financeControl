import { useState } from 'react';
import type { Budget } from '../api/types';
import { QueryState } from '../components/QueryState';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { shiftMonth } from '../i18n/format';
import { useBudgets, useCreateBudget, useDeleteBudget, useUpdateBudget } from '../queries';
import { useCategoryLookup } from '../queries/lookups';
import { Bar, ConfirmDelete, Field, level, Modal, PageHead } from '../ui';

export function Budgets() {
  const { t, money, month, today } = useI18n();
  const [key, setKey] = useState(today.slice(0, 7));
  const q = useBudgets(key);
  const cats = useCategoryLookup();
  const delMut = useDeleteBudget();
  const [form, setForm] = useState<Budget | 'new' | null>(null);
  const [del, setDel] = useState<Budget | null>(null);
  const catName = (id: string) => { const c = cats.categories.find(x => x.id === id); return c ? cats.name(c) : '—'; };

  return (
    <>
      <PageHead sub={month(key, true)} title={t('nav.budgets')}>
        <div className="month-nav">
          <button type="button" className="btn-sm" aria-label={t('month.prev')} onClick={() => setKey(shiftMonth(key, -1))}>‹</button>
          <button type="button" className="btn-sm" aria-label={t('month.next')} onClick={() => setKey(shiftMonth(key, 1))}>›</button>
        </div>
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ {t('budgets.new')}</button>
      </PageHead>
      <QueryState q={q} isEmpty={d => d.length === 0}
        empty={<>{t('budgets.empty')}<button type="button" className="btn btn-1" onClick={() => setForm('new')}>{t('budgets.create')}</button></>}>
        {list => {
          const limit = list.reduce((n, b) => n + b.limit, 0);
          const spent = list.reduce((n, b) => n + b.spent, 0);
          const pct = limit > 0 ? Math.round((spent / limit) * 100) : 0;
          return (
            <>
              <div className="kpis">
                <div className="hero">
                  <span className="lbl">{t('budgets.spentOfBudgeted')}</span><span className="num" style={{ fontSize: 26 }}>{money(spent)}</span>
                  <span style={{ fontSize: 13, color: '#B9BEC6' }}>{t('budgets.ofLimit', { limit: money(limit), pct })}</span>
                </div>
                <div className="card kpi"><span className="lbl">{t('budgets.leftThisMonth')}</span><span className="num v">{money(Math.max(0, limit - spent))}</span></div>
              </div>
              <div className="cols">
                {list.map(b => {
                  const c = level(b.pct, b.alertPct);
                  return (
                    <section className="card" key={b.id}>
                      <div className="spread"><h2>{catName(b.categoryId)}</h2><span style={{ color: c, fontWeight: 600 }}>{b.pct}%</span></div>
                      <Bar value={b.pct} color={c} />
                      <div className="spread muted" style={{ fontSize: 13 }}>
                        <span>{t('budgets.spent', { amount: money(b.spent) })}</span>
                        <span>{b.spent > b.limit ? t('budgets.over', { amount: money(b.spent - b.limit) }) : t('budgets.left', { amount: money(b.limit - b.spent) })} · {t('budgets.limitOf', { amount: money(b.limit) })}</span>
                      </div>
                      <div className="actions">
                        <button type="button" className="btn-sm" onClick={() => setForm(b)}>{t('common.edit')}</button>
                        <button type="button" className="btn-sm danger" onClick={() => setDel(b)}>{t('common.delete')}</button>
                      </div>
                    </section>);
                })}
              </div>
            </>
          );
        }}
      </QueryState>
      {form && <BudgetForm budget={form === 'new' ? null : form} existing={q.data ?? []} onClose={() => setForm(null)} />}
      {del && <ConfirmDelete title={t('budgets.deleteTitle', { name: catName(del.categoryId) })} body={t('budgets.deleteBody')} cta={t('budgets.deleteCta')} onClose={() => setDel(null)}
        onConfirm={() => delMut.mutateAsync(del.id)} />}
    </>
  );
}


function BudgetForm({ budget, existing, onClose }: { budget: Budget | null; existing: Budget[]; onClose: () => void }) {
  const { t, parseMoney, moneyInput } = useI18n();
  const cats = useCategoryLookup();
  const create = useCreateBudget();
  const update = useUpdateBudget();
  const free = cats.tops.filter(c => c.id === budget?.categoryId || !existing.some(b => b.categoryId === c.id));
  const [picked, setPicked] = useState(budget?.categoryId ?? '');
  // always a listed option; '' only when no free category exists
  const categoryId = free.some(c => c.id === picked) ? picked : free[0]?.id ?? '';
  const [lim, setLim] = useState(budget ? moneyInput(budget.limit) : '');
  const [alertPct, setAlertPct] = useState(budget?.alertPct ?? 85);
  const [limErr, setLimErr] = useState('');
  const [catErr, setCatErr] = useState('');

  const save = async () => {
    const limit = parseMoney(lim);
    setLimErr(''); setCatErr('');
    if (!limit) return setLimErr(t('budgets.limitRequired'));
    if (!categoryId) return setCatErr(t('budgets.categoryRequired'));
    const body = { categoryId, limit, alertPct };
    try { await (budget ? update.mutateAsync({ id: budget.id, body }) : create.mutateAsync(body)); onClose(); } catch (e) { setCatErr(errorMessage(e, t)); }
  };

  return (
    <Modal title={budget ? t('budgets.formEdit') : t('budgets.new')} onClose={onClose}>
      <div className="grid">
        <Field label={t('budgets.category')} error={catErr}>{id => (
          <select id={id} value={categoryId} onChange={e => setPicked(e.target.value)} disabled={!free.length}>
            {free.length ? free.map(c => <option key={c.id} value={c.id}>{cats.name(c)}</option>) : <option value="">{t('budgets.allHave')}</option>}
          </select>)}</Field>
        <Field label={t('budgets.monthlyLimit')} error={limErr}>{id => <input id={id} inputMode="decimal" value={lim} onChange={e => setLim(e.target.value)} autoFocus />}</Field>
        <Field label={t('budgets.alertAt')}>{id => (
          <select id={id} value={alertPct} onChange={e => setAlertPct(Number(e.target.value))}>
            {[70, 80, 85, 90, 100].map(n => <option key={n} value={n}>{t('budgets.alertOption', { pct: n })}</option>)}
          </select>)}</Field>
      </div>
      <p className="muted" style={{ margin: 0, fontSize: 13 }}>{t('budgets.note')}</p>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" onClick={() => void save()}>{budget ? t('common.saveChanges') : t('budgets.createCta')}</button>
      </div>
    </Modal>
  );
}

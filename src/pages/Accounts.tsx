import { useState } from 'react';
import type { Account, AccountKind } from '../api/types';
import { QueryState } from '../components/QueryState';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { PALETTE } from '../icons';
import { useAccounts, useCreateAccount, useDeleteAccount, useOverview, useUpdateAccount } from '../queries';
import { ConfirmDelete, Field, Modal, OptionRadio, PageHead, Swatches } from '../ui';

const KINDS: AccountKind[] = ['checking', 'savings', 'cash'];

export function Accounts() {
  const { t, tOr, money, today } = useI18n();
  const q = useAccounts();
  const ov = useOverview(today.slice(0, 7));
  const [form, setForm] = useState<Account | 'new' | null>(null);
  const [del, setDel] = useState<Account | null>(null);
  const sum = (list: Account[], k: AccountKind) => list.filter(a => !a.archived && a.kind === k).reduce((n, a) => n + a.balance, 0);

  return (
    <>
      <PageHead sub={q.data ? t('accounts.sub', { active: q.data.filter(a => !a.archived).length, archived: q.data.filter(a => a.archived).length }) : ''} title={t('nav.accounts')}>
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ {t('accounts.new')}</button>
      </PageHead>
      <QueryState q={q} isEmpty={d => d.length === 0}
        empty={<>{t('accounts.empty')}<button type="button" className="btn btn-1" onClick={() => setForm('new')}>{t('accounts.add')}</button></>}>
        {list => (
          <>
            <div className="kpis">
              <div className="hero"><span className="lbl">{t('accounts.total')}</span><span className="num" style={{ fontSize: 26 }}>{ov.data ? money(ov.data.totalBalance) : '…'}</span></div>
              {KINDS.map(k => <div className="card kpi" key={k}><span className="lbl">{tOr(`kind.${k}`, k)}</span><span className="num v" style={{ fontSize: 22 }}>{money(sum(list, k))}</span></div>)}
            </div>
            <section className="card" style={{ padding: '8px 20px 12px' }}>
              <div className="scroll">
                <div className="trow thead acc-cols">
                  <span className="th">{t('accounts.col.account')}</span><span className="th hide-m">{t('accounts.col.type')}</span><span className="th hide-m">{t('accounts.col.institution')}</span>
                  <span className="th hide-m">{t('accounts.col.inTotal')}</span><span className="th r">{t('accounts.col.balance')}</span><span className="th r">{t('accounts.col.actions')}</span>
                </div>
                {list.map(a => (
                  <div className="trow acc-cols" key={a.id} style={{ opacity: a.archived ? 0.55 : 1 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 500 }}>
                      <span style={{ width: 32, height: 32, borderRadius: 10, background: a.color, flex: 'none' }} />{a.name}{a.archived && <span className="badge">{t('accounts.archivedBadge')}</span>}
                    </span>
                    <span className="hide-m" style={{ color: 'var(--ink-2)' }}>{tOr(`kind.${a.kind}`, a.kind)}</span>
                    <span className="hide-m" style={{ color: 'var(--ink-2)' }}>{a.bank || '—'}</span>
                    <span className="hide-m" style={{ color: 'var(--ink-2)' }}>{a.inTotal ? t('common.yes') : t('common.no')}</span>
                    <span className="num r">{money(a.balance)}</span>
                    <span className="actions-c" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                      <button type="button" className="btn-sm" onClick={() => setForm(a)}>{t('common.edit')}</button>
                      <button type="button" className="btn-sm danger" onClick={() => setDel(a)}>{t('common.delete')}</button>
                    </span>
                  </div>))}
              </div>
            </section>
            {del && <DeleteAccount account={del} others={list.filter(a => a.id !== del.id)} onClose={() => setDel(null)} />}
          </>
        )}
      </QueryState>
      {form && <AccountForm account={form === 'new' ? null : form} onClose={() => setForm(null)} />}
    </>
  );
}

function AccountForm({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const { t, tOr, parseSigned, moneyInput } = useI18n();
  const create = useCreateAccount();
  const update = useUpdateAccount();
  const live = useAccounts().data?.find(a => a.id === account?.id) ?? account;
  const [kind, setKind] = useState<AccountKind>(account?.kind ?? 'checking');
  const [name, setName] = useState(account?.name ?? '');
  const [bank, setBank] = useState(account?.bank ?? '');
  const [bal, setBal] = useState(account ? (account.balance === 0 ? '0' : moneyInput(account.balance)) : '');
  const [color, setColor] = useState(account?.color ?? PALETTE[2][1]);
  const [inTotal, setInTotal] = useState(account?.inTotal ?? true);
  const [err, setErr] = useState('');
  const [balErr, setBalErr] = useState('');

  const run = async (fn: () => Promise<unknown>) => {
    setErr(''); setBalErr('');
    try { await fn(); onClose(); } catch (e) { setErr(errorMessage(e, t)); }
  };
  const save = () => {
    setErr(''); setBalErr('');
    if (!name.trim()) return setErr(t('accounts.nameRequired'));
    const text = bal.trim();
    const parsed = text === '' ? (account ? null : 0) : parseSigned(text);
    if (parsed === null) return setBalErr(t('common.invalidAmount'));
    const entered = parsed;
    return run(() => account && live
      ? update.mutateAsync({ id: account.id, body: { name: name.trim(), kind, bank, color, inTotal, opening: live.opening + (entered - live.balance) } })
      : create.mutateAsync({ name: name.trim(), kind, bank, color, inTotal, opening: entered }));
  };
  const toggleArchive = () => run(() => update.mutateAsync({ id: account!.id, body: { archived: !account!.archived } }));

  return (
    <Modal title={account ? t('accounts.formEdit') : t('accounts.new')} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="lbl">{t('common.type')}</span>
        <div className="seg">{KINDS.map(k => <button key={k} type="button" className={kind === k ? 'on' : ''} onClick={() => setKind(k)}>{tOr(`kind.${k}`, k)}</button>)}</div>
      </div>
      <div className="grid">
        <Field label={t('accounts.name')} error={err}>{id => <input id={id} placeholder={t('accounts.namePh')} value={name} onChange={e => setName(e.target.value)} autoFocus />}</Field>
        <Field label={t('accounts.institution')}>{id => <input id={id} placeholder={t('common.optional')} value={bank} onChange={e => setBank(e.target.value)} />}</Field>
        <Field label={account ? t('accounts.currentBalance') : t('accounts.openingBalance')} error={balErr}>{id => <input id={id} inputMode="decimal" value={bal} onChange={e => setBal(e.target.value)} />}</Field>
      </div>
      <div className="fld"><span className="lbl">{t('common.color')}</span><Swatches value={color} onChange={setColor} /></div>
      <label className="check"><input type="checkbox" checked={inTotal} onChange={e => setInTotal(e.target.checked)} />{t('accounts.includeInTotal')}</label>
      <div className="footer">
        {account && <button type="button" className="btn btn-2" onClick={() => void toggleArchive()}>{account.archived ? t('common.unarchive') : t('common.archive')}</button>}
        <span className="grow" />
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" onClick={() => void save()}>{account ? t('common.saveChanges') : t('accounts.createCta')}</button>
      </div>
    </Modal>
  );
}

function DeleteAccount({ account, others, onClose }: { account: Account; others: Account[]; onClose: () => void }) {
  const { t } = useI18n();
  const del = useDeleteAccount();
  const [mode, setMode] = useState<'move' | 'delete'>(others.length ? 'move' : 'delete');
  const [target, setTarget] = useState(others[0]?.id ?? '');
  return (
    <ConfirmDelete title={t('accounts.deleteTitle', { name: account.name })} body={t('accounts.deleteBody')} cta={t('accounts.deleteCta')} onClose={onClose}
      onConfirm={() => del.mutateAsync({ id: account.id, moveTo: mode === 'move' ? target : undefined })}>
      {others.length > 0 && (
        <OptionRadio name="del" checked={mode === 'move'} onChange={() => setMode('move')}>
          {t('accounts.moveOption')}{' '}
          <select value={target} onChange={e => setTarget(e.target.value)} onClick={e => e.stopPropagation()} className="flt" aria-label={t('common.moveTo')}>
            {others.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </OptionRadio>
      )}
      <OptionRadio name="del" checked={mode === 'delete'} onChange={() => setMode('delete')}>{t('accounts.deleteOption')}</OptionRadio>
    </ConfirmDelete>
  );
}

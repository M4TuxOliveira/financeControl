import { useState } from 'react';
import { useStore } from '../store';
import { deleteAccount, saveAccount } from '../actions';
import { ConfirmDelete, Empty, Field, Modal, OptionRadio, PageHead, Swatches } from '../ui';
import { PALETTE } from '../icons';
import { accountBalance, money, moneyInput, parseMoney, totalBalance, txCount, uid } from '../lib';
import type { Account, AccountKind } from '../types';

const KINDS: [AccountKind, string][] = [['checking', 'Checking'], ['savings', 'Savings'], ['cash', 'Cash']];
const kindName = (k: AccountKind) => KINDS.find(x => x[0] === k)![1];

export function Accounts() {
  const s = useStore();
  const [form, setForm] = useState<Account | 'new' | null>(null);
  const [del, setDel] = useState<Account | null>(null);
  const sum = (k: AccountKind) => s.accounts.filter(a => !a.archived && a.kind === k).reduce((n, a) => n + accountBalance(s, a), 0);
  const active = s.accounts.filter(a => !a.archived).length;

  return (
    <>
      <PageHead sub={`${active} active · ${s.accounts.length - active} archived`} title="Accounts">
        <button type="button" className="btn btn-1" onClick={() => setForm('new')}>+ New account</button>
      </PageHead>
      <div className="kpis">
        <div className="hero"><span className="lbl">Total in accounts</span><span className="num" style={{ fontSize: 26 }}>{money(totalBalance(s))}</span></div>
        {KINDS.map(([k, l]) => <div className="card kpi" key={k}><span className="lbl">{l}</span><span className="num v" style={{ fontSize: 22 }}>{money(sum(k))}</span></div>)}
      </div>
      <section className="card" style={{ padding: '8px 20px 12px' }}>
        {s.accounts.length === 0 ? <Empty>No accounts yet.<button type="button" className="btn btn-1" onClick={() => setForm('new')}>Add account</button></Empty> :
          <div className="scroll"><div style={{ minWidth: 0 }}>
            <div className="trow thead acc-cols"><span className="th">Account</span><span className="th hide-m">Type</span><span className="th hide-m">Institution</span><span className="th hide-m">In total</span><span className="th r">Balance</span><span className="th r">Actions</span></div>
            {s.accounts.map(a => (
              <div className="trow acc-cols" key={a.id} style={{ opacity: a.archived ? .55 : 1 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 10, fontWeight: 500 }}>
                  <span style={{ width: 32, height: 32, borderRadius: 10, background: a.color, flex: 'none' }} />{a.name}{a.archived && <span className="badge">Archived</span>}</span>
                <span className="hide-m" style={{ color: 'var(--ink-2)' }}>{kindName(a.kind)}</span>
                <span className="hide-m" style={{ color: 'var(--ink-2)' }}>{a.bank || '—'}</span>
                <span className="hide-m" style={{ color: 'var(--ink-2)' }}>{a.inTotal ? 'Yes' : 'No'}</span>
                <span className="num r">{money(accountBalance(s, a))}</span>
                <span className="actions-c" style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                  <button type="button" className="btn-sm" onClick={() => setForm(a)}>Edit</button>
                  <button type="button" className="btn-sm danger" onClick={() => setDel(a)}>Delete</button>
                </span>
              </div>))}
          </div></div>}
      </section>
      {form && <AccountForm account={form === 'new' ? null : form} onClose={() => setForm(null)} />}
      {del && <DeleteAccount account={del} onClose={() => setDel(null)} />}
    </>
  );
}

function AccountForm({ account, onClose }: { account: Account | null; onClose: () => void }) {
  const s = useStore();
  const [a, setA] = useState<Account>(account ?? { id: uid(), name: '', kind: 'checking', bank: '', opening: 0, color: PALETTE[2][1], inTotal: true, archived: false });
  const [bal, setBal] = useState(account ? moneyInput(accountBalance(s, account)) : '');
  const [err, setErr] = useState('');
  const set = <K extends keyof Account>(k: K, v: Account[K]) => setA(x => ({ ...x, [k]: v }));

  const submit = (archive = false) => {
    if (!a.name.trim()) return setErr('Give the account a name.');
    // Editing the balance adjusts the opening balance so that today's balance matches.
    const opening = account ? a.opening + (parseMoney(bal) - accountBalance(s, account)) : parseMoney(bal);
    saveAccount({ ...a, name: a.name.trim(), opening, archived: archive ? !a.archived : a.archived });
    onClose();
  };

  return (
    <Modal title={account ? 'Edit account' : 'New account'} onClose={onClose}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <span className="lbl">Type</span>
        <div className="seg">{KINDS.map(([k, l]) => <button key={k} type="button" className={a.kind === k ? 'on' : ''} onClick={() => set('kind', k)}>{l}</button>)}</div>
      </div>
      <div className="grid">
        <Field label="Account name" error={err}>{id => <input id={id} placeholder="e.g. Itaú Personnalité" value={a.name} onChange={e => set('name', e.target.value)} autoFocus />}</Field>
        <Field label="Institution">{id => <input id={id} placeholder="Optional" value={a.bank} onChange={e => set('bank', e.target.value)} />}</Field>
        <Field label={account ? 'Current balance' : 'Opening balance'}>{id => <input id={id} inputMode="decimal" placeholder="R$ 0,00" value={bal} onChange={e => setBal(e.target.value)} />}</Field>
      </div>
      <div className="fld"><span className="lbl">Color</span><Swatches value={a.color} onChange={c => set('color', c)} /></div>
      <label className="check"><input type="checkbox" checked={a.inTotal} onChange={e => set('inTotal', e.target.checked)} />Include in total balance</label>
      <div className="footer">
        {account && <button type="button" className="btn btn-2" onClick={() => submit(true)}>{a.archived ? 'Unarchive' : 'Archive'}</button>}
        <span className="grow" />
        <button type="button" className="btn btn-2" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-1" onClick={() => submit()}>{account ? 'Save changes' : 'Create account'}</button>
      </div>
    </Modal>
  );
}

function DeleteAccount({ account, onClose }: { account: Account; onClose: () => void }) {
  const s = useStore();
  const others = s.accounts.filter(a => a.id !== account.id);
  const n = txCount(s, account.id);
  const [mode, setMode] = useState<'move' | 'delete'>(others.length && n ? 'move' : 'delete');
  const [target, setTarget] = useState(others[0]?.id ?? '');
  return (
    <ConfirmDelete title={`Delete ${account.name}?`} cta="Delete account" onClose={onClose}
      body={`It has ${n} transaction${n === 1 ? '' : 's'} and a balance of ${money(accountBalance(s, account))}.`}
      onConfirm={() => deleteAccount(account.id, mode === 'move' ? target : null)}>
      {n > 0 && <>
        {others.length > 0 && <OptionRadio name="del" checked={mode === 'move'} onChange={() => setMode('move')}>
          Move transactions to{' '}
          <select value={target} onChange={e => setTarget(e.target.value)} onClick={e => e.stopPropagation()} className="flt" aria-label="Target account">
            {others.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select></OptionRadio>}
        <OptionRadio name="del" checked={mode === 'delete'} onChange={() => setMode('delete')}>Delete the account and all its transactions</OptionRadio>
      </>}
    </ConfirmDelete>
  );
}

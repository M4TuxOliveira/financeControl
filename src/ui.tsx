import { useEffect, useId, useState, type ReactNode } from 'react';
import { CAT_ICONS, NAV_ICONS, PALETTE } from './icons';
import { useI18n } from './i18n';
import { errorMessage } from './i18n/errors';

export function Svg({ d, size = 20, sw = 1.8 }: { d: string; size?: number; sw?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={sw}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d={d} /></svg>
  );
}
export const NavIcon = ({ name, size }: { name: string; size?: number }) => <Svg d={NAV_ICONS[name]} size={size} />;
export const CatIcon = ({ name, size }: { name: string; size?: number }) => <Svg d={CAT_ICONS[name] ?? CAT_ICONS.Paw} size={size} />;

export function Modal({ title, onClose, children, wide, extra }: {
  title: string; onClose: () => void; children: ReactNode; wide?: boolean; extra?: ReactNode;
}) {
  const { t } = useI18n();
  const id = useId();
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', k);
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', k); document.body.style.overflow = ''; };
  }, [onClose]);
  return (
    <div className="scrim" onMouseDown={e => e.target === e.currentTarget && onClose()}>
      <div className={'modal' + (wide ? ' wide' : '')} role="dialog" aria-modal="true" aria-labelledby={id}>
        <div className="modal-head">
          <h2 id={id}>{title}</h2>
          {extra}
          <button type="button" className="iconbtn" onClick={onClose} aria-label={t('common.close')}
            style={{ height: 40, width: 40, border: 0, background: 'var(--bg)' }}><Svg d={NAV_ICONS.close} size={18} sw={2} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children, error }: { label: string; children: (id: string) => ReactNode; error?: string }) {
  const id = useId();
  return (
    <div className="fld">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {error && <span className="err">{error}</span>}
    </div>
  );
}

export function Bar({ value, color }: { value: number; color: string }) {
  return <div className="bar" role="progressbar" aria-valuenow={Math.min(100, value)} aria-valuemin={0} aria-valuemax={100}>
    <i style={{ width: Math.min(100, value) + '%', background: color }} /></div>;
}
const pct = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 100) : 0);
export const ratio = (a: number, b: number) => Math.min(100, pct(a, b));

export const level = (p: number, alert = 85) => (p >= 100 ? 'var(--danger)' : p >= alert ? 'var(--warn)' : 'var(--pos)');

export function Swatches({ value, onChange }: { value: string; onChange: (c: string) => void }) {
  const { t, tOr } = useI18n();
  return (
    <div className="swatches" role="radiogroup" aria-label={t('common.color')}>
      {PALETTE.map(([name, c]) => (
        <button key={c} type="button" role="radio" aria-checked={value === c} aria-label={tOr(`color.${name}`, name)}
          className={'sw' + (value === c ? ' on' : '')} style={{ background: c, color: c }} onClick={() => onChange(c)} />
      ))}
    </div>
  );
}

export function PageHead({ sub, title, children }: { sub?: string; title: string; children?: ReactNode }) {
  return (
    <div className="head">
      <div><span className="sub">{sub}</span><h1>{title}</h1></div>
      {children && <div className="actions">{children}</div>}
    </div>
  );
}

export const Empty = ({ children }: { children: ReactNode }) => <div className="empty">{children}</div>;

export function OptionRadio({ checked, onChange, children, name }: {
  checked: boolean; onChange: () => void; children: ReactNode; name: string;
}) {
  return <label className={'opt' + (checked ? ' on' : '')}><input type="radio" name={name} checked={checked} onChange={onChange} /><span>{children}</span></label>;
}

export function ConfirmDelete({ title, body, cta, onConfirm, onClose, children }: {
  title: string; body?: ReactNode; cta: string; onConfirm: () => Promise<unknown> | void; onClose: () => void; children?: ReactNode;
}) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const run = async () => {
    setBusy(true); setErr('');
    try { await onConfirm(); onClose(); } catch (e) { setErr(errorMessage(e, t)); setBusy(false); }
  };
  return (
    <Modal title={title} onClose={onClose}>
      {body && <p style={{ margin: 0, lineHeight: 1.5, color: 'var(--ink-2)' }}>{body}</p>}
      {children}
      {err && <span className="err" role="alert">{err}</span>}
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-3" disabled={busy} onClick={() => void run()}>{cta}</button>
      </div>
    </Modal>
  );
}

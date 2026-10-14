import { useState } from 'react';
import { useStore } from '../store';
import { deleteCategory, saveCategory } from '../actions';
import { CAT_ICONS, PALETTE } from '../icons';
import { CatIcon, ConfirmDelete, Empty, Field, Modal, PageHead, Swatches } from '../ui';
import { monthKey, today, uid, categoryFamily } from '../lib';
import type { Category } from '../types';

export function Categories() {
  const s = useStore();
  const [form, setForm] = useState<Category | null>(null);
  const [del, setDel] = useState<Category | null>(null);
  const key = monthKey(today());
  const count = (c: Category) => {
    const fam = categoryFamily(s, c.id);
    return s.transactions.filter(t => monthKey(t.date) === key && t.categoryId && fam.includes(t.categoryId)).length;
  };
  const top = s.categories.filter(c => !c.parentId);
  const blank = (parentId: string | null, parent?: Category): Category =>
    ({ id: uid(), name: '', parentId, icon: parent?.icon ?? 'Paw', color: parent?.color ?? PALETTE[0][1], system: false });

  return (
    <>
      <PageHead sub={`${top.length} categories`} title="Categories">
        <button type="button" className="btn btn-1" onClick={() => setForm(blank(null))}>+ New category</button>
      </PageHead>
      {top.length === 0 && <section className="card"><Empty>No categories.</Empty></section>}
      <div className="cols">
        {top.map(c => (
          <section className="card" key={c.id}>
            <div className="card-head" style={{ alignItems: 'center' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span className="mono" style={{ background: c.color }}><CatIcon name={c.icon} /></span>
                <span className="stack"><h2>{c.name}</h2><span className="muted" style={{ fontSize: 12 }}>{c.system ? 'Default' : 'Custom'} · {count(c)} transactions this month</span></span>
              </span>
            </div>
            <div className="actions">
              <button type="button" className="btn-sm" onClick={() => setForm(c)}>Edit</button>
              <button type="button" className="btn-sm" onClick={() => setForm(blank(c.id, c))}>+ Subcategory</button>
              <button type="button" className="btn-sm danger" onClick={() => setDel(c)}>Delete</button>
            </div>
            <div>{s.categories.filter(x => x.parentId === c.id).map(x => (
              <div className="line" key={x.id}>
                <span style={{ flex: 1 }}>{x.name}</span>
                <span className="muted" style={{ fontSize: 12 }}>{s.transactions.filter(t => t.categoryId === x.id && monthKey(t.date) === key).length} tx</span>
                <button type="button" className="btn-sm" onClick={() => setForm(x)}>Edit</button>
                <button type="button" className="btn-sm danger" onClick={() => setDel(x)}>Delete</button>
              </div>))}</div>
          </section>))}
      </div>
      {form && <CategoryForm cat={form} onClose={() => setForm(null)} />}
      {del && <DeleteCategory cat={del} onClose={() => setDel(null)} />}
    </>
  );
}

function CategoryForm({ cat, onClose }: { cat: Category; onClose: () => void }) {
  const s = useStore();
  const isNew = !s.categories.some(c => c.id === cat.id);
  const [c, setC] = useState(cat);
  const [err, setErr] = useState('');
  const set = <K extends keyof Category>(k: K, v: Category[K]) => setC(x => ({ ...x, [k]: v }));
  const hasSubs = s.categories.some(x => x.parentId === c.id);
  const submit = () => {
    if (!c.name.trim()) return setErr('Give it a name.');
    saveCategory({ ...c, name: c.name.trim() });
    onClose();
  };
  return (
    <Modal title={(isNew ? 'New ' : 'Edit ') + (c.parentId ? 'subcategory' : 'category')} onClose={onClose}>
      <div className="grid">
        <Field label="Name" error={err}>{id => <input id={id} value={c.name} autoFocus onChange={e => set('name', e.target.value)} />}</Field>
        <Field label="Parent">{id => <select id={id} value={c.parentId ?? ''} disabled={hasSubs} onChange={e => set('parentId', e.target.value || null)}>
          <option value="">None (top-level)</option>{s.categories.filter(x => !x.parentId && x.id !== c.id).map(x => <option key={x.id} value={x.id}>{x.name}</option>)}</select>}</Field>
      </div>
      <div className="fld"><span className="lbl">Icon</span>
        <div className="icons" role="radiogroup" aria-label="Icon">{Object.keys(CAT_ICONS).map(k => (
          <button key={k} type="button" role="radio" aria-checked={c.icon === k} aria-label={k} className="iconbtn"
            style={c.icon === k ? { border: `2px solid ${c.color}`, color: c.color } : undefined} onClick={() => set('icon', k)}><CatIcon name={k} /></button>))}</div></div>
      <div className="fld"><span className="lbl">Color</span><Swatches value={c.color} onChange={v => set('color', v)} /></div>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>Cancel</button>
        <button type="button" className="btn btn-1" onClick={submit}>{isNew ? 'Create' : 'Save changes'}</button>
      </div>
    </Modal>
  );
}

function DeleteCategory({ cat, onClose }: { cat: Category; onClose: () => void }) {
  const s = useStore();
  const fam = categoryFamily(s, cat.id);
  const n = s.transactions.filter(t => t.categoryId && fam.includes(t.categoryId)).length;
  const options = s.categories.filter(c => !fam.includes(c.id));
  const [target, setTarget] = useState(cat.parentId ?? '');
  return (
    <ConfirmDelete title={`Delete ${cat.name}?`} cta="Delete" onClose={onClose}
      body={`${n} transaction${n === 1 ? '' : 's'} use${n === 1 ? 's' : ''} this category${s.categories.some(c => c.parentId === cat.id) ? ' or its subcategories, which are deleted too' : ''}. Budgets on it are removed.`}
      onConfirm={() => deleteCategory(cat.id, target || null)}>
      {n > 0 && <Field label="Move transactions to">{id => <select id={id} value={target} onChange={e => setTarget(e.target.value)}>
        <option value="">Uncategorized</option>{options.map(c => <option key={c.id} value={c.id}>{c.parentId ? '   ' : ''}{c.name}</option>)}</select>}</Field>}
    </ConfirmDelete>
  );
}

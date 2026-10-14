import { useState } from 'react';
import type { Category } from '../api/types';
import { QueryState } from '../components/QueryState';
import { useI18n } from '../i18n';
import { errorMessage } from '../i18n/errors';
import { CAT_ICONS, PALETTE } from '../icons';
import { useCategories, useCreateCategory, useDeleteCategory, useUpdateCategory } from '../queries';
import { useCategoryLookup } from '../queries/lookups';
import { CatIcon, ConfirmDelete, Field, Modal, PageHead, Swatches } from '../ui';

// `shown` is the name as first displayed in the field and `orig` the backend's stored name: an unedited system
// category keeps its backend (English) name instead of being renamed to the translated text.
type Draft = { id: string | null; name: string; shown: string; orig: string; parentId: string | null; icon: string; color: string };

export function Categories() {
  const { t } = useI18n();
  const q = useCategories();
  const cats = useCategoryLookup();
  const [form, setForm] = useState<Draft | null>(null);
  const [del, setDel] = useState<Category | null>(null);
  const blank = (parent?: Category): Draft => ({ id: null, name: '', shown: '', orig: '', parentId: parent?.id ?? null, icon: parent?.icon ?? 'Paw', color: parent?.color ?? PALETTE[0][1] });
  const edit = (c: Category): Draft => {
    const shown = c.system && c.key ? cats.name(c) : c.name;
    return { id: c.id, name: shown, shown, orig: c.name, parentId: c.parentId, icon: c.icon, color: c.color };
  };

  return (
    <>
      <PageHead sub={q.data ? t('catpage.count', { n: cats.tops.length }) : ''} title={t('nav.categories')}>
        <button type="button" className="btn btn-1" onClick={() => setForm(blank())}>+ {t('catpage.new')}</button>
      </PageHead>
      <QueryState q={q} isEmpty={d => d.length === 0} empty={t('catpage.empty')}>
        {() => (
          <div className="cols">
            {cats.tops.map(c => (
              <section className="card" key={c.id}>
                <div className="card-head" style={{ alignItems: 'center' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                    <span className="mono" style={{ background: c.color }}><CatIcon name={c.icon} /></span>
                    <span className="stack"><h2>{cats.name(c)}</h2><span className="muted" style={{ fontSize: 12 }}>{c.system ? t('catpage.default') : t('catpage.custom')}</span></span>
                  </span>
                </div>
                <div className="actions">
                  <button type="button" className="btn-sm" onClick={() => setForm(edit(c))}>{t('common.edit')}</button>
                  <button type="button" className="btn-sm" onClick={() => setForm(blank(c))}>+ {t('catpage.addSub')}</button>
                  <button type="button" className="btn-sm danger" onClick={() => setDel(c)}>{t('common.delete')}</button>
                </div>
                <div>{cats.subsOf(c.id).map(s => (
                  <div className="line" key={s.id}>
                    <span style={{ flex: 1 }}>{cats.name(s)}</span>
                    <button type="button" className="btn-sm" onClick={() => setForm(edit(s))}>{t('common.edit')}</button>
                    <button type="button" className="btn-sm danger" onClick={() => setDel(s)}>{t('common.delete')}</button>
                  </div>))}</div>
              </section>))}
          </div>
        )}
      </QueryState>
      {form && <CategoryForm draft={form} onClose={() => setForm(null)} />}
      {del && <DeleteCategory cat={del} onClose={() => setDel(null)} />}
    </>
  );
}

function CategoryForm({ draft, onClose }: { draft: Draft; onClose: () => void }) {
  const { t, tOr } = useI18n();
  const cats = useCategoryLookup();
  const create = useCreateCategory();
  const update = useUpdateCategory();
  const [c, setC] = useState(draft);
  const [err, setErr] = useState('');
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setC(x => ({ ...x, [k]: v }));
  const isNew = c.id === null;
  const hasSubs = c.id !== null && cats.subsOf(c.id).length > 0;
  const parents = cats.tops.filter(x => x.id !== c.id);
  // never submit a parent id the select does not list
  const parentId = parents.some(x => x.id === c.parentId) ? c.parentId : null;

  const save = async () => {
    if (!c.name.trim()) return setErr(t('catpage.nameRequired'));
    const name = c.name === c.shown ? c.orig || c.name.trim() : c.name.trim();
    const body = { name, parentId, icon: c.icon, color: c.color };
    try { await (isNew ? create.mutateAsync(body) : update.mutateAsync({ id: c.id!, body })); onClose(); } catch (e) { setErr(errorMessage(e, t)); }
  };
  const title = c.parentId ? (isNew ? t('catpage.formNewSub') : t('catpage.formEditSub')) : (isNew ? t('catpage.formNewCat') : t('catpage.formEditCat'));

  return (
    <Modal title={title} onClose={onClose}>
      <div className="grid">
        <Field label={t('common.name')} error={err}>{id => <input id={id} value={c.name} autoFocus onChange={e => { set('name', e.target.value); setErr(''); }} />}</Field>
        <Field label={t('catpage.parent')}>{id => (
          <select id={id} value={parentId ?? ''} disabled={hasSubs} onChange={e => set('parentId', e.target.value || null)}>
            <option value="">{t('catpage.topLevel')}</option>
            {parents.map(x => <option key={x.id} value={x.id}>{cats.name(x)}</option>)}
          </select>)}</Field>
      </div>
      <div className="fld"><span className="lbl">{t('common.icon')}</span>
        <div className="icons" role="radiogroup" aria-label={t('common.icon')}>
          {Object.keys(CAT_ICONS).map(k => (
            <button key={k} type="button" role="radio" aria-checked={c.icon === k} aria-label={tOr(`icon.${k}`, k)} className="iconbtn"
              style={c.icon === k ? { border: `2px solid ${c.color}`, color: c.color } : undefined} onClick={() => set('icon', k)}><CatIcon name={k} /></button>))}
        </div>
      </div>
      <div className="fld"><span className="lbl">{t('common.color')}</span><Swatches value={c.color} onChange={v => set('color', v)} /></div>
      <div className="footer">
        <button type="button" className="btn btn-2" onClick={onClose}>{t('common.cancel')}</button>
        <button type="button" className="btn btn-1" onClick={() => void save()}>{isNew ? t('common.create') : t('common.saveChanges')}</button>
      </div>
    </Modal>
  );
}

function DeleteCategory({ cat, onClose }: { cat: Category; onClose: () => void }) {
  const { t } = useI18n();
  const cats = useCategoryLookup();
  const del = useDeleteCategory();
  const family = new Set([cat.id, ...cats.subsOf(cat.id).map(s => s.id)]);
  const [target, setTarget] = useState('');
  return (
    <ConfirmDelete title={t('catpage.deleteTitle', { name: cats.name(cat) })} body={t('catpage.deleteBody')} cta={t('catpage.deleteCta')} onClose={onClose}
      onConfirm={() => del.mutateAsync({ id: cat.id, moveTo: target || undefined })}>
      <Field label={t('catpage.moveTransactions')}>{id => (
        <select id={id} value={target} onChange={e => setTarget(e.target.value)}>
          <option value="">{t('common.uncategorized')}</option>
          {cats.categories.filter(c => !family.has(c.id)).map(c => <option key={c.id} value={c.id}>{c.parentId ? '— ' : ''}{cats.name(c)}</option>)}
        </select>)}</Field>
    </ConfirmDelete>
  );
}

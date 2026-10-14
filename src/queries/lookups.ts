import { useMemo } from 'react';
import type { Category } from '../api/types';
import { useI18n } from '../i18n';
import { useAccounts, useCards, useCategories } from './index';

export function useCategoryLookup() {
  const { data, isSuccess } = useCategories();
  const { tOr, t } = useI18n();
  return useMemo(() => {
    const categories: Category[] = data ?? [];
    const byId = new Map(categories.map(c => [c.id, c]));
    const name = (c: Category) => (c.system && c.key ? tOr(`categories.${c.key}`, c.name) : c.name);
    const label = (id?: string) => {
      const c = id ? byId.get(id) : undefined;
      if (!c) return t('common.uncategorized');
      const p = c.parentId ? byId.get(c.parentId) : undefined;
      return p ? `${name(p)} › ${name(c)}` : name(c);
    };
    const color = (id?: string) => (id ? byId.get(id)?.color : undefined) ?? 'var(--muted)';
    const tops = categories.filter(c => !c.parentId);
    const subsOf = (id: string) => categories.filter(c => c.parentId === id);
    return { categories, ready: isSuccess, name, label, color, tops, subsOf };
  }, [data, isSuccess, tOr, t]);
}

export function useAccountLookup() {
  const a = useAccounts();
  const c = useCards();
  return useMemo(() => {
    const accounts = a.data ?? [];
    const cards = c.data ?? [];
    const names = new Map<string, string>([...accounts, ...cards].map(x => [x.id, x.name]));
    return { accounts, cards, ready: a.isSuccess && c.isSuccess, name: (id?: string) => (id ? names.get(id) : undefined) ?? '—' };
  }, [a.data, c.data, a.isSuccess, c.isSuccess]);
}

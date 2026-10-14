import { useSyncExternalStore } from 'react';
import { LEGACY_KEY } from './legacy';

export type Theme = 'system' | 'light' | 'dark';
export type Prefs = { theme: Theme; userName: string };

const KEY = 'financeControl:prefs';
const THEMES: Theme[] = ['system', 'light', 'dark'];

function load(): Prefs {
  const fallback: Prefs = { theme: 'system', userName: '' };
  const read = (k: string): Record<string, unknown> | null => {
    try { const r = localStorage.getItem(k); return r ? (JSON.parse(r) as Record<string, unknown>) : null; } catch { return null; }
  };
  const src = read(KEY) ?? read(LEGACY_KEY);
  if (!src) return fallback;
  return {
    theme: THEMES.includes(src.theme as Theme) ? (src.theme as Theme) : 'system',
    userName: typeof src.userName === 'string' ? src.userName : '',
  };
}

let current: Prefs = load();
const listeners = new Set<() => void>();

export const getPrefs = () => current;

export function setPrefs(p: Partial<Prefs>): void {
  current = { ...current, ...p };
  try { localStorage.setItem(KEY, JSON.stringify(current)); } catch { /* storage unavailable: keep in memory */ }
  listeners.forEach(l => l());
}

export function usePrefs(): Prefs {
  return useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb); }; }, getPrefs);
}

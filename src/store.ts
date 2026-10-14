import { useSyncExternalStore } from 'react';
import type { Category, State } from './types';
import { uid } from './lib';

const KEY = 'financeControl:v1';

const cat = (name: string, icon: string, color: string, subs: string[] = []): Category[] => {
  const id = uid();
  return [
    { id, name, parentId: null, icon, color, system: true },
    ...subs.map(n => ({ id: uid(), name: n, parentId: id, icon, color, system: true })),
  ];
};

export function freshState(): State {
  return {
    v: 1, userName: '', theme: 'system',
    accounts: [], cards: [], transactions: [], budgets: [], goals: [],
    categories: [
      ...cat('Groceries', 'Cart', '#3D5A0E', ['Supermarket', 'Bakery', 'Butcher']),
      ...cat('Housing', 'Home', '#1F4E79', ['Rent', 'Condo fee', 'Utilities']),
      ...cat('Transport', 'Car', '#A16207', ['Fuel', 'Ride apps', 'Parking']),
      ...cat('Food', 'Food', '#C2410C', ['Restaurants', 'Delivery']),
      ...cat('Subscriptions', 'Bolt', '#3D5A0E'),
      ...cat('Electronics', 'Bolt', '#1F4E79'),
      ...cat('Health', 'Paw', '#9D174D', ['Pharmacy', 'Doctor']),
      ...cat('Travel', 'Plane', '#6E3FA0'),
      ...cat('Sports', 'Run', '#6E3FA0', ['Equipment', 'Gym']),
      ...cat('Income', 'Gift', '#0B6B4E', ['Salary', 'Other income']),
    ],
  };
}

function load(): State {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === 1) return s as State;
    }
  } catch { /* corrupted or unavailable storage: start fresh */ }
  return freshState();
}

let state: State = load();
const listeners = new Set<() => void>();

export function update(fn: (s: State) => State) {
  state = fn(state);
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* quota: keep in memory */ }
  listeners.forEach(l => l());
}
export function replaceState(s: State) { update(() => s); }
export const getState = () => state;
export function useStore(): State {
  return useSyncExternalStore(
    cb => { listeners.add(cb); return () => { listeners.delete(cb); }; },
    () => state,
  );
}

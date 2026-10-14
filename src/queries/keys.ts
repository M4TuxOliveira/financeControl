export const qk = {
  accounts: ['accounts'] as const,
  cards: ['cards'] as const,
  categories: ['categories'] as const,
  transactions: ['transactions'] as const,
  budgets: ['budgets'] as const,
  goals: ['goals'] as const,
  overview: ['overview'] as const,
  me: ['me'] as const,
};

type Keys = readonly (readonly string[])[];
const { accounts, cards, categories, transactions, budgets, goals, overview, me } = qk;

/** What each kind of mutation makes stale (spec §4). Keys are prefixes. */
export const INVALIDATES = {
  transaction: [transactions, accounts, cards, budgets, goals, overview],
  payCard: [transactions, accounts, cards, overview],
  contribute: [goals, transactions, accounts, overview],
  account: [accounts, cards, goals, transactions, overview],
  card: [cards, transactions, overview],
  category: [categories, budgets, transactions, overview],
  budget: [budgets, overview],
  goal: [goals, overview],
  receipt: [transactions],
  me: [me],
  import: [accounts, cards, categories, transactions, budgets, goals, overview, me],
} satisfies Record<string, Keys>;

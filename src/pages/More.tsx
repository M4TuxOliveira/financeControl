import { PageHead } from '../ui';

const LINKS: [string, string, string][] = [
  ['transactions', 'Transactions', 'Search, edit and import everything you recorded'],
  ['accounts', 'Accounts', 'Checking, savings and cash'],
  ['cards', 'Credit cards', 'Cards and their statements'],
  ['categories', 'Categories', 'Categories and subcategories'],
  ['settings', 'Settings', 'Theme, backup and reset'],
];

export function More() {
  return (
    <>
      <PageHead title="More" />
      <section className="card" style={{ padding: '8px 20px' }}>
        {LINKS.map(([k, t, d]) => (
          <a key={k} href={'#/' + k} className="line" style={{ color: 'var(--ink)', minHeight: 56 }}>
            <span className="stack" style={{ flex: 1 }}><b style={{ fontWeight: 500 }}>{t}</b><span className="muted" style={{ fontSize: 13 }}>{d}</span></span>
            <span className="muted">›</span>
          </a>
        ))}
      </section>
    </>
  );
}

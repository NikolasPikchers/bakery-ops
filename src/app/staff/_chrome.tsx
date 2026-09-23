import { monthLabel, nextMonth, prevMonth } from '@/lib/finance/month';

export const PIES = '#1a4633';
export const CONF_INK = '#4c805a';
export const rub = (n: number) => Math.round(n).toLocaleString('ru-RU');

type Tab = 'revenue' | 'shifts';
const TABS: { key: Tab; href: string; label: string }[] = [
  { key: 'revenue', href: '/staff', label: 'Выручка' },
  { key: 'shifts', href: '/staff/shifts', label: 'Смены и ЗП' },
];

const arrow: React.CSSProperties = { width: 44, height: 44, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 22, fontWeight: 700 };

export function StaffPage({ tab, title, month, showOwnerLink, children }: { tab: Tab; title: string; month: string; showOwnerLink: boolean; children: React.ReactNode }) {
  const base = TABS.find((t) => t.key === tab)!.href;
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 14px' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)', padding: 'calc(env(safe-area-inset-top) + 12px) 0 10px' }}>
          {showOwnerLink && (
            // eslint-disable-next-line @next/next/no-html-link-for-pages
            <a href="/" style={{ display: 'inline-flex', alignItems: 'center', minHeight: 44, fontSize: 13, fontWeight: 700, color: 'var(--muted)' }}>
              ← к учёту
            </a>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{title}</h1>
            <nav aria-label="Месяц" style={{ display: 'flex', alignItems: 'center', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14 }}>
              <a href={`${base}?month=${prevMonth(month)}`} aria-label="Предыдущий месяц" style={arrow}>‹</a>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', minWidth: 104, textAlign: 'center' }}>{monthLabel(month)}</span>
              <a href={`${base}?month=${nextMonth(month)}`} aria-label="Следующий месяц" style={arrow}>›</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </div>
      <nav
        aria-label="Вкладки"
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 10, background: 'var(--card)', borderTop: '1px solid var(--line)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex' }}>
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <a
                key={t.key}
                href={`${t.href}?month=${month}`}
                aria-current={on ? 'page' : undefined}
                style={{
                  flex: 1,
                  minHeight: 56,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 14,
                  fontWeight: on ? 800 : 600,
                  color: on ? 'var(--profit)' : 'var(--muted)',
                  borderTop: `3px solid ${on ? 'var(--profit)' : 'transparent'}`,
                }}
              >
                {t.label}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}

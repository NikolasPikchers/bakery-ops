'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

type NavItem = { href: string; label: string };

const NAV: NavItem[] = [
  { href: '/', label: 'Дашборд' },
  { href: '/revenue', label: 'Выручка' },
  { href: '/expenses', label: 'Расходы' },
  { href: '/breakdown', label: 'Разбивка' },
  { href: '/fot', label: 'ФОТ' },
  { href: '/upload', label: 'Загрузить' },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function AppShell({ authed, children }: { authed: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  if (!authed) return <>{children}</>;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', width: '100%', overflow: 'hidden' }}>
      {/* top bar */}
      <header
        style={{
          height: 76,
          flexShrink: 0,
          display: 'flex',
          alignItems: 'center',
          gap: 22,
          padding: '0 28px',
          borderBottom: '1px solid var(--line)',
          background: 'var(--card)',
          zIndex: 10,
        }}
      >
        <Link href="/" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span
            style={{
              width: 38,
              height: 38,
              borderRadius: 12,
              background: 'var(--brand)',
              display: 'grid',
              placeItems: 'center',
              boxShadow: '0 2px 8px rgba(63,125,95,0.28)',
            }}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/nikas-logo-white.png" alt="Nikas Cafe" style={{ width: '74%', height: 'auto', display: 'block' }} />
          </span>
          <span style={{ lineHeight: 1 }}>
            <span style={{ display: 'block', fontWeight: 800, fontSize: 17, color: 'var(--ink)', letterSpacing: '-0.02em' }}>Nikas Cafe</span>
            <span style={{ display: 'block', fontSize: 11, color: 'var(--muted)', fontWeight: 600, marginTop: 3 }}>Учёт пекарен</span>
          </span>
        </Link>

        <div style={{ display: 'flex', gap: 4, background: 'var(--chip)', padding: 5, borderRadius: 999, marginLeft: 6, flexWrap: 'wrap' }}>
          {NAV.map((n) => {
            const active = isActive(pathname, n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                style={{
                  padding: '9px 16px',
                  borderRadius: 999,
                  fontSize: 14,
                  fontWeight: 700,
                  color: active ? 'var(--ink)' : 'var(--muted)',
                  background: active ? 'var(--card)' : 'transparent',
                  boxShadow: active ? 'var(--shadow)' : 'none',
                }}
              >
                {n.label}
              </Link>
            );
          })}
        </div>

        <span style={{ flex: 1 }} />
        <span
          style={{
            width: 40,
            height: 40,
            borderRadius: 12,
            background: 'var(--profit)',
            display: 'grid',
            placeItems: 'center',
            color: '#fff',
            fontWeight: 800,
            fontSize: 14,
          }}
          title="Nikas"
        >
          НП
        </span>
      </header>

      <main style={{ flex: 1, minWidth: 0, overflowY: 'auto' }}>{children}</main>
    </div>
  );
}

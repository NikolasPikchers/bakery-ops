'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { signOut } from 'next-auth/react';

type NavItem = { href: string; label: string; icon: React.ReactNode };

const I = (d: React.ReactNode) => (
  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
    {d}
  </svg>
);

const NAV: NavItem[] = [
  { href: '/', label: 'Дашборд', icon: I(<path d="M3 13h7V3H3v10Zm0 8h7v-6H3v6Zm11 0h7V11h-7v10Zm0-18v6h7V3h-7Z" />) },
  { href: '/revenue', label: 'Выручка', icon: I(<><rect x="2.5" y="6" width="19" height="12" rx="2" /><circle cx="12" cy="12" r="2.6" /></>) },
  { href: '/breakdown', label: 'Разбивка', icon: I(<path d="M4 20V4M20 20H4M8.5 20v-6M13.5 20V9M18.5 20v-3" strokeLinecap="round" strokeLinejoin="round" />) },
  { href: '/upload', label: 'Загрузить', icon: I(<path d="M12 16V4m0 0 4 4m-4-4-4 4M4 20h16" strokeLinecap="round" strokeLinejoin="round" />) },
];

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export function AppShell({ authed, children }: { authed: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  if (!authed) return <>{children}</>;

  return (
    <div style={{ display: 'flex', minHeight: '100vh', width: '100%' }}>
      {/* icon rail */}
      <nav
        style={{
          width: 72,
          background: 'var(--card)',
          borderRight: '1px solid var(--line)',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          paddingTop: 22,
          gap: 8,
          flexShrink: 0,
          position: 'sticky',
          top: 0,
          height: '100vh',
        }}
      >
        {NAV.map((n) => {
          const active = isActive(pathname, n.href);
          return (
            <Link
              key={n.href}
              href={n.href}
              title={n.label}
              aria-label={n.label}
              style={{
                width: 46,
                height: 46,
                borderRadius: 14,
                display: 'grid',
                placeItems: 'center',
                color: active ? '#fff' : 'var(--muted)',
                background: active ? 'var(--profit)' : 'transparent',
              }}
            >
              {n.icon}
            </Link>
          );
        })}
        <span style={{ flex: 1 }} />
        <button
          onClick={() => signOut({ callbackUrl: '/login' })}
          aria-label="Выйти"
          title="Выйти"
          style={{
            width: 46,
            height: 46,
            borderRadius: 14,
            border: 'none',
            background: 'transparent',
            color: 'var(--muted)',
            cursor: 'pointer',
            display: 'grid',
            placeItems: 'center',
            marginBottom: 18,
          }}
        >
          {I(<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9" strokeLinecap="round" strokeLinejoin="round" />)}
        </button>
      </nav>

      {/* main column */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        {/* top bar */}
        <header
          style={{
            height: 76,
            display: 'flex',
            alignItems: 'center',
            gap: 22,
            padding: '0 28px',
            borderBottom: '1px solid var(--line)',
            background: 'var(--card)',
            position: 'sticky',
            top: 0,
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

        <main style={{ flex: 1, minWidth: 0 }}>{children}</main>
      </div>
    </div>
  );
}

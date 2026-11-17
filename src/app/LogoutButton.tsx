import { logout } from './actions/auth';

/** Кнопка «Выйти» — обычная форма с серверным действием, работает и без JavaScript. */
export function LogoutButton({ style }: { style?: React.CSSProperties }) {
  return (
    <form action={logout} style={{ display: 'contents' }}>
      <button
        type="submit"
        style={{
          minHeight: 40,
          padding: '0 14px',
          borderRadius: 12,
          border: '1px solid var(--line)',
          background: 'var(--card)',
          color: 'var(--muted)',
          fontSize: 14,
          fontWeight: 700,
          cursor: 'pointer',
          ...style,
        }}
      >
        Выйти
      </button>
    </form>
  );
}

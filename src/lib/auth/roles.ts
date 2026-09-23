export type Role = 'owner' | 'staff';
export type RoleEnv = { APP_PASSWORD?: string; STAFF_PASSWORD?: string; AUTH_SECRET?: string };

/** Роль по введённому паролю. Владелец проверяется первым: при совпадении паролей побеждает он. */
export function resolveRole(password: string, env: RoleEnv): Role | null {
  const owner = env.APP_PASSWORD ?? '';
  if (owner.length > 0 && password === owner) return 'owner';
  const staff = env.STAFF_PASSWORD ?? '';
  if (staff.length > 0 && password === staff) return 'staff';
  return null;
}

/**
 * Отпечаток пароля сотрудников для JWT: HMAC-SHA256 на AUTH_SECRET, первые 8 байт в hex.
 * Web Crypto — работает и в middleware, и в Node.
 */
export async function staffFingerprint(staffPassword: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  // Web Crypto не принимает HMAC-ключ нулевой длины.
  const key = await crypto.subtle.importKey('raw', enc.encode(secret || 'bakery-ops'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(staffPassword)));
  return Array.from(sig.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Действующая роль по данным из JWT. Токены без роли выданы до появления ролей — это владелец.
 * Сотрудник действителен, только пока отпечаток совпадает с текущим STAFF_PASSWORD.
 */
export async function effectiveRole(claims: { role?: unknown; fp?: unknown }, env: RoleEnv): Promise<Role | null> {
  if (claims.role === undefined || claims.role === 'owner') return 'owner';
  if (claims.role !== 'staff') return null;
  const staff = env.STAFF_PASSWORD ?? '';
  if (staff.length === 0) return null;
  return claims.fp === (await staffFingerprint(staff, env.AUTH_SECRET ?? '')) ? 'staff' : null;
}

/** Роль из сессии Auth.js (её кладёт session-колбэк); всё остальное — null. */
export function roleOf(session: unknown): Role | null {
  const role = (session as { role?: unknown } | null | undefined)?.role;
  return role === 'owner' || role === 'staff' ? role : null;
}

export type AccessDecision = { kind: 'allow' } | { kind: 'redirect'; to: string } | { kind: 'deny'; status: 401 | 403 };

/** Кто куда ходит: таблица из раздела 1 спеки. */
export function accessDecision(role: Role | null, pathname: string): AccessDecision {
  if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) return { kind: 'allow' };
  const isApi = pathname.startsWith('/api/');
  if (role === null) return isApi ? { kind: 'deny', status: 401 } : { kind: 'redirect', to: '/login' };
  if (role === 'owner') return { kind: 'allow' };
  if (isApi) return { kind: 'deny', status: 403 };
  if (pathname === '/staff' || pathname.startsWith('/staff/')) return { kind: 'allow' };
  return { kind: 'redirect', to: '/staff' };
}

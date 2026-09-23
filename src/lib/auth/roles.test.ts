import { describe, it, expect } from 'vitest';
import { resolveRole, staffFingerprint, effectiveRole, roleOf, accessDecision } from './roles';

const env = { APP_PASSWORD: 'owner-pass', STAFF_PASSWORD: 'staff-pass', AUTH_SECRET: 'secret-1' };

describe('resolveRole', () => {
  it('пароль владельца → owner', () => expect(resolveRole('owner-pass', env)).toBe('owner'));
  it('пароль сотрудников → staff', () => expect(resolveRole('staff-pass', env)).toBe('staff'));
  it('неверный пароль → null', () => expect(resolveRole('nope', env)).toBeNull());
  it('пустой ввод при пустом STAFF_PASSWORD → null', () => expect(resolveRole('', { ...env, STAFF_PASSWORD: '' })).toBeNull());
  it('STAFF_PASSWORD не задан → вход сотрудников отключён', () =>
    expect(resolveRole('staff-pass', { APP_PASSWORD: 'owner-pass' })).toBeNull());
  it('пароли совпали по ошибке настройки → владелец побеждает', () =>
    expect(resolveRole('same', { APP_PASSWORD: 'same', STAFF_PASSWORD: 'same' })).toBe('owner'));
});

describe('staffFingerprint', () => {
  it('детерминирован, 16 hex-символов, пароля в нём нет', async () => {
    const a = await staffFingerprint('staff-pass', 'secret-1');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await staffFingerprint('staff-pass', 'secret-1')).toBe(a);
    expect(a).not.toContain('staff');
  });
  it('меняется и при смене пароля, и при смене секрета', async () => {
    const a = await staffFingerprint('staff-pass', 'secret-1');
    expect(await staffFingerprint('staff-pass-2', 'secret-1')).not.toBe(a);
    expect(await staffFingerprint('staff-pass', 'secret-2')).not.toBe(a);
  });
  it('пустой секрет не роняет расчёт', async () => {
    expect(await staffFingerprint('staff-pass', '')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('effectiveRole', () => {
  it('сессия до выкладки (без роли) → owner', async () => expect(await effectiveRole({}, env)).toBe('owner'));
  it('owner → owner', async () => expect(await effectiveRole({ role: 'owner' }, env)).toBe('owner'));
  it('staff с актуальным отпечатком → staff', async () => {
    const fp = await staffFingerprint('staff-pass', 'secret-1');
    expect(await effectiveRole({ role: 'staff', fp }, env)).toBe('staff');
  });
  it('staff после смены пароля → null', async () => {
    const fp = await staffFingerprint('old-pass', 'secret-1');
    expect(await effectiveRole({ role: 'staff', fp }, env)).toBeNull();
  });
  it('staff без отпечатка → null', async () => expect(await effectiveRole({ role: 'staff' }, env)).toBeNull());
  it('staff, когда STAFF_PASSWORD убрали → null', async () => {
    const fp = await staffFingerprint('staff-pass', 'secret-1');
    expect(await effectiveRole({ role: 'staff', fp }, { ...env, STAFF_PASSWORD: '' })).toBeNull();
  });
  it('неизвестная роль → null', async () => expect(await effectiveRole({ role: 'admin' }, env)).toBeNull());
});

describe('roleOf', () => {
  it('читает роль из сессии', () => {
    expect(roleOf({ role: 'owner' })).toBe('owner');
    expect(roleOf({ role: 'staff' })).toBe('staff');
  });
  it('нет сессии, нет роли или мусор → null', () => {
    expect(roleOf(null)).toBeNull();
    expect(roleOf(undefined)).toBeNull();
    expect(roleOf({})).toBeNull();
    expect(roleOf({ role: null })).toBeNull();
    expect(roleOf({ role: 'admin' })).toBeNull();
  });
});

describe('accessDecision', () => {
  const allow = { kind: 'allow' };
  it('без сессии: страницы → /login, API → 401', () => {
    expect(accessDecision(null, '/')).toEqual({ kind: 'redirect', to: '/login' });
    expect(accessDecision(null, '/staff')).toEqual({ kind: 'redirect', to: '/login' });
    expect(accessDecision(null, '/api/finance')).toEqual({ kind: 'deny', status: 401 });
  });
  it('/api/auth пропускается при любой роли', () => {
    expect(accessDecision(null, '/api/auth/session')).toEqual(allow);
    expect(accessDecision('staff', '/api/auth/session')).toEqual(allow);
  });
  it('владельцу можно всё, включая вкладки сотрудников', () => {
    for (const p of ['/', '/fot', '/staff', '/staff/shifts', '/api/fot/attendance']) expect(accessDecision('owner', p)).toEqual(allow);
  });
  it('сотруднику — /staff и всё под ним', () => {
    expect(accessDecision('staff', '/staff')).toEqual(allow);
    expect(accessDecision('staff', '/staff/shifts')).toEqual(allow);
  });
  it('сотрудника с любой другой страницы, включая похожую /staffx, уводит на /staff', () => {
    for (const p of ['/', '/fot', '/revenue', '/breakdown', '/expenses', '/upload', '/sheets/abc', '/staffx']) {
      expect(accessDecision('staff', p)).toEqual({ kind: 'redirect', to: '/staff' });
    }
  });
  it('сотруднику любой API, кроме auth, — 403', () => {
    for (const p of ['/api/fot/attendance', '/api/finance', '/api/revenue/manual', '/api/upload']) {
      expect(accessDecision('staff', p)).toEqual({ kind: 'deny', status: 403 });
    }
  });
});

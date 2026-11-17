import { beforeEach, describe, expect, it, vi } from 'vitest';

const { signOut } = vi.hoisted(() => ({ signOut: vi.fn() }));
vi.mock('@/auth', () => ({ signOut }));

import { logout } from './auth';

beforeEach(() => vi.clearAllMocks());

describe('logout', () => {
  it('завершает сессию и ведёт на страницу входа — чтобы войти под другим паролем', async () => {
    await logout();
    expect(signOut).toHaveBeenCalledWith({ redirectTo: '/login' });
  });
});

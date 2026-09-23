import { describe, it, expect, vi } from 'vitest';
import { auth } from '@/auth';
import { requireOwner } from './require-owner';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);

describe('requireOwner', () => {
  it('нет сессии → 401', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await requireOwner();
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(401);
  });
  it('сотрудник → 403 с кодом FORBIDDEN', async () => {
    mockAuth.mockResolvedValue({ role: 'staff', user: { name: 'Сотрудник' } });
    const r = (await requireOwner()) as Response;
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'Forbidden', code: 'FORBIDDEN' });
  });
  it('сессия с отозванной ролью (сменили пароль сотрудников) → 401', async () => {
    mockAuth.mockResolvedValue({ role: null, user: { name: 'Сотрудник' } });
    expect(((await requireOwner()) as Response).status).toBe(401);
  });
  it('владелец → сама сессия, роут берёт из неё имя', async () => {
    const s = { role: 'owner', user: { name: 'Пекарня' } };
    mockAuth.mockResolvedValue(s);
    expect(await requireOwner()).toBe(s);
  });
});

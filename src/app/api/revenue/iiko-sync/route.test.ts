import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { auth } from '@/auth';
import { runIikoSync } from '@/lib/iiko/sync';

const { prisma } = vi.hoisted(() => ({ prisma: {} }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getPrisma: () => prisma }));
vi.mock('@/lib/iiko/sync', async (orig) => ({ ...(await orig<typeof import('@/lib/iiko/sync')>()), runIikoSync: vi.fn() }));

const req = (body?: unknown) =>
  new Request('http://localhost/api/revenue/iiko-sync', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ now: new Date('2026-11-17T09:40:00+03:00'), toFake: ['Date'] });
  vi.mocked(auth).mockResolvedValue({ role: 'owner', user: { name: 'Владелец' }, expires: '' } as never);
  vi.mocked(runIikoSync).mockImplementation(async (_p, r) => ({ ...r, days: 1, imported: 0, updated: 1 }));
});

afterEach(() => vi.useRealTimers());

describe('POST /api/revenue/iiko-sync', () => {
  it('без тела — вчера и сегодня по Москве', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(runIikoSync).toHaveBeenCalledWith(prisma, { from: '2026-11-16', till: '2026-11-17' });
    expect(await res.json()).toMatchObject({ from: '2026-11-16', till: '2026-11-17', updated: 1 });
  });

  it('свой период до 31 дня', async () => {
    expect((await POST(req({ from: '2026-11-01', till: '2026-11-17' }))).status).toBe(200);
    expect(runIikoSync).toHaveBeenCalledWith(prisma, { from: '2026-11-01', till: '2026-11-17' });
  });

  it.each([
    [{ from: '2026-11-31', till: '2026-12-01' }],
    [{ from: '2026-11-10', till: '2026-11-01' }],
    [{ from: '2026-10-01', till: '2026-11-17' }],
    [{ from: '2026-11-01' }],
  ])('400 на неверный период %j', async (body) => {
    expect((await POST(req(body))).status).toBe(400);
    expect(runIikoSync).not.toHaveBeenCalled();
  });

  it('ошибка iiko — 502 с текстом', async () => {
    vi.mocked(runIikoSync).mockRejectedValue(new Error('iiko /api/reporting/v1/olap/get → HTTP 429: too many'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await POST(req());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/HTTP 429/);
  });
});

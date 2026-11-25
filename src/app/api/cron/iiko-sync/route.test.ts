import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';
import { iikoCatchUpWindow, runIikoSync } from '@/lib/iiko/sync';

const { prisma } = vi.hoisted(() => ({ prisma: {} }));
vi.mock('@/lib/db/client', () => ({ getPrisma: () => prisma }));
vi.mock('@/lib/iiko/sync', async (orig) => ({ ...(await orig<typeof import('@/lib/iiko/sync')>()), runIikoSync: vi.fn(), iikoCatchUpWindow: vi.fn() }));

const req = (authorization?: string, query = '') =>
  new Request(`http://localhost/api/cron/iiko-sync${query}`, { headers: authorization ? { authorization } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  // Окно с догрузкой считается по базе — здесь его подменяем; логика окна — в sync.test.ts.
  vi.mocked(iikoCatchUpWindow).mockResolvedValue({ from: '2026-11-17', till: '2026-11-18' });
  vi.stubEnv('CRON_SECRET', 'cron-s3cret');
  vi.useFakeTimers({ now: new Date('2026-11-18T04:05:00+03:00'), toFake: ['Date'] });
  vi.mocked(runIikoSync).mockResolvedValue({ from: '2026-11-17', till: '2026-11-18', days: 2, imported: 1, updated: 1 });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('GET /api/cron/iiko-sync', () => {
  it.each([
    ['без заголовка', undefined],
    ['с чужим секретом', 'Bearer nope'],
  ])('401 %s — iiko не трогаем', async (_name, header) => {
    expect((await GET(req(header))).status).toBe(401);
    expect(runIikoSync).not.toHaveBeenCalled();
  });

  it('401, если CRON_SECRET не задан, даже на «Bearer undefined»', async () => {
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(req('Bearer undefined'))).status).toBe(401);
    expect((await GET(req('Bearer '))).status).toBe(401);
    expect(runIikoSync).not.toHaveBeenCalled();
  });

  it('без периода — окно с догрузкой пропущенных дней (по умолчанию вчера и сегодня)', async () => {
    const res = await GET(req('Bearer cron-s3cret'));
    expect(res.status).toBe(200);
    expect(iikoCatchUpWindow).toHaveBeenCalledWith(prisma, expect.any(Date));
    expect(runIikoSync).toHaveBeenCalledWith(prisma, { from: '2026-11-17', till: '2026-11-18' });
    expect(await res.json()).toEqual({ from: '2026-11-17', till: '2026-11-18', days: 2, imported: 1, updated: 1 });
  });

  it('ошибка iiko — 500 с текстом, чтобы она была видна в логах крона', async () => {
    vi.mocked(runIikoSync).mockRejectedValue(new Error('iiko /api/v2/access_token → HTTP 401: bad'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const res = await GET(req('Bearer cron-s3cret'));
    expect(res.status).toBe(500);
    // Период — в ответе: видно, сколько дней ждёт догрузки.
    expect(await res.json()).toMatchObject({ error: expect.stringMatching(/HTTP 401/), from: '2026-11-17', till: '2026-11-18' });
  });

  it('?from=&till= — загрузка истории за свой период', async () => {
    const res = await GET(req('Bearer cron-s3cret', '?from=2026-01-01&till=2026-11-17'));
    expect(res.status).toBe(200);
    expect(runIikoSync).toHaveBeenCalledWith(prisma, { from: '2026-01-01', till: '2026-11-17' });
    expect(iikoCatchUpWindow).not.toHaveBeenCalled();
  });

  it.each([
    ['«по» раньше «с»', '?from=2026-11-17&till=2026-01-01'],
    ['больше 366 дней', '?from=2025-01-01&till=2026-11-17'],
    ['одна дата', '?from=2026-11-17'],
    ['мусор', '?from=вчера&till=сегодня'],
  ])('400 — %s, iiko не трогаем', async (_name, query) => {
    const res = await GET(req('Bearer cron-s3cret', query));
    expect(res.status).toBe(400);
    expect(runIikoSync).not.toHaveBeenCalled();
  });
});

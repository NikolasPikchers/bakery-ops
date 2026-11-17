import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runTbankSync } = vi.hoisted(() => ({ runTbankSync: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getPrisma: () => ({}) }));
vi.mock('@/lib/tbank/sync', async (orig) => ({ ...(await orig<typeof import('@/lib/tbank/sync')>()), runTbankSync }));

import { GET } from './route';

const req = (qs = '', authorization?: string) =>
  new Request(`http://localhost/api/cron/tbank-sync${qs}`, { headers: authorization ? { authorization } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'cron-s3cret');
  vi.useFakeTimers({ now: new Date('2026-11-18T04:05:00+03:00'), toFake: ['Date'] });
  runTbankSync.mockResolvedValue({ dryRun: false });
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
});

describe('GET /api/cron/tbank-sync', () => {
  it('без секрета — 401', async () => {
    expect((await GET(req('', 'Bearer nope'))).status).toBe(401);
    vi.stubEnv('CRON_SECRET', '');
    expect((await GET(req('', 'Bearer '))).status).toBe(401);
    expect(runTbankSync).not.toHaveBeenCalled();
  });

  it('по умолчанию — последние 7 дней, с записью', async () => {
    expect((await GET(req('', 'Bearer cron-s3cret'))).status).toBe(200);
    expect(runTbankSync).toHaveBeenCalledWith({}, { from: '2026-11-12', till: '2026-11-18' }, { dryRun: false });
  });

  it('свой период и пробный прогон (?dry=1)', async () => {
    await GET(req('?from=2026-10-25&till=2026-10-31&dry=1', 'Bearer cron-s3cret'));
    expect(runTbankSync).toHaveBeenCalledWith({}, { from: '2026-10-25', till: '2026-10-31' }, { dryRun: true });
    expect((await GET(req('?from=2026-10-31&till=2026-10-25', 'Bearer cron-s3cret'))).status).toBe(400);
  });
});

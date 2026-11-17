import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { prisma, getAccounts, getStatement } = vi.hoisted(() => ({
  prisma: { expense: { findMany: vi.fn() } },
  getAccounts: vi.fn(),
  getStatement: vi.fn(),
}));
vi.mock('@/lib/db/client', () => ({ getPrisma: () => prisma }));
vi.mock('@/lib/tbank/client', async (orig) => ({
  ...(await orig<typeof import('@/lib/tbank/client')>()),
  TBusinessClient: vi.fn(function () {
    return { getAccounts, getStatement };
  }),
}));

import { GET } from './route';

const ACC = '40802810000000002271';
const req = (qs = '', authorization?: string) =>
  new Request(`http://localhost/api/cron/tbank-diagnose${qs}`, { headers: authorization ? { authorization } : {} });

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv('CRON_SECRET', 'cron-s3cret');
  vi.stubEnv('TBUSINESS_API_TOKEN', 't.token');
  getAccounts.mockResolvedValue([{ accountNumber: ACC, accountType: 'Current', currency: '643' }]);
  getStatement.mockResolvedValue([{ documentNumber: '1', operationDate: '2026-10-31T10:00:00+03:00', typeOfOperation: 'Debit', accountAmount: 10 }]);
  prisma.expense.findMany.mockResolvedValue([{ externalId: `${ACC}|1|31.10.2026|10,0`, category: 'prochee' }]);
});

afterEach(() => vi.unstubAllEnvs());

describe('GET /api/cron/tbank-diagnose', () => {
  it('без секрета — 401, банк не трогаем', async () => {
    expect((await GET(req('', 'Bearer nope'))).status).toBe(401);
    expect(getAccounts).not.toHaveBeenCalled();
  });

  it('без токена банка — 500 с понятной ошибкой', async () => {
    vi.stubEnv('TBUSINESS_API_TOKEN', '');
    const res = await GET(req('', 'Bearer cron-s3cret'));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toMatch(/TBUSINESS_API_TOKEN/);
  });

  it('сверяет выписку API с расходами из файла за период; счёт — только последние 4 цифры', async () => {
    const res = await GET(req('?from=2026-10-01&till=2026-10-31', 'Bearer cron-s3cret'));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(getStatement).toHaveBeenCalledWith(ACC, '2026-10-01', '2026-10-31', expect.any(Function));
    expect(body.reports[0]).toMatchObject({ account: '…2271', bestMatch: { matched: 1 } });
    expect(JSON.stringify(body)).not.toContain(ACC);
  });

  it('кривой период — 400', async () => {
    expect((await GET(req('?from=2026-13-01&till=2026-10-31', 'Bearer cron-s3cret'))).status).toBe(400);
  });

  it('ошибка банка — 502 с текстом банка', async () => {
    getAccounts.mockRejectedValue(new Error('T-API /api/v4/bank-accounts → HTTP 403: IP not allowed'));
    const res = await GET(req('', 'Bearer cron-s3cret'));
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/IP not allowed/);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const { runTbankSync, requireOwner } = vi.hoisted(() => ({ runTbankSync: vi.fn(), requireOwner: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getPrisma: () => ({}) }));
vi.mock('@/lib/auth/require-owner', () => ({ requireOwner }));
vi.mock('@/lib/tbank/sync', async (orig) => ({ ...(await orig<typeof import('@/lib/tbank/sync')>()), runTbankSync }));

import { POST } from './route';

const req = (body?: unknown) =>
  new Request('http://localhost/api/expenses/tbank-sync', { method: 'POST', ...(body ? { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } } : {}) });

beforeEach(() => {
  vi.clearAllMocks();
  requireOwner.mockResolvedValue({ role: 'owner' });
  vi.useFakeTimers({ now: new Date('2026-11-18T10:00:00+03:00'), toFake: ['Date'] });
  runTbankSync.mockResolvedValue({ from: 'x', till: 'y', accounts: 1, fetched: 3, outgoing: 2, imported: 1, updated: 1, dryRun: false });
});
afterEach(() => vi.useRealTimers());

describe('POST /api/expenses/tbank-sync', () => {
  it('не владелец — отказ, банк не трогаем', async () => {
    requireOwner.mockResolvedValue(new Response('no', { status: 403 }));
    expect((await POST(req())).status).toBe(403);
    expect(runTbankSync).not.toHaveBeenCalled();
  });

  it('без тела — последние 7 дней по Москве', async () => {
    const res = await POST(req());
    expect(res.status).toBe(200);
    expect(runTbankSync).toHaveBeenCalledWith({}, { from: '2026-11-12', till: '2026-11-18' });
  });

  it('свой период до 93 дней', async () => {
    await POST(req({ from: '2026-11-01', till: '2026-11-18' }));
    expect(runTbankSync).toHaveBeenCalledWith({}, { from: '2026-11-01', till: '2026-11-18' });
    expect((await POST(req({ from: '2026-01-01', till: '2026-11-18' }))).status).toBe(400);
    expect((await POST(req({ from: '2026-11-18', till: '2026-11-01' }))).status).toBe(400);
  });

  it('ошибка банка — 502 с текстом', async () => {
    runTbankSync.mockRejectedValue(new Error('T-API /api/v1/statement → HTTP 403: IP not allowed'));
    const res = await POST(req());
    expect(res.status).toBe(502);
    expect((await res.json()).error).toMatch(/IP not allowed/);
  });
});

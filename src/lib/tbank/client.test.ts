import { describe, it, expect } from 'vitest';
import { TBusinessClient, moscowDate } from './client';

type Call = { url: URL; headers: Record<string, string> };

function fakeFetch(handler: (url: URL) => { status?: number; body: unknown }) {
  const calls: Call[] = [];
  const fetchImpl = (async (input: string, init: RequestInit) => {
    const url = new URL(String(input));
    calls.push({ url, headers: init.headers as Record<string, string> });
    const { status = 200, body } = handler(url);
    return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe('moscowDate', () => {
  it('дата операции по Москве, а не по UTC', () => {
    expect(moscowDate('2026-10-31T22:30:00Z')).toBe('2026-11-01');
    expect(moscowDate('2026-10-31T12:00:00+03:00')).toBe('2026-10-31');
    expect(moscowDate('2026-10-31')).toBe('2026-10-31');
  });
});

describe('TBusinessClient', () => {
  it('getAccounts: Bearer-токен, /api/v4/bank-accounts', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: [{ accountNumber: '40802810000000000001', currency: '643' }] }));
    const c = new TBusinessClient({ token: 't.abc', fetchImpl });
    expect(await c.getAccounts()).toEqual([{ accountNumber: '40802810000000000001', currency: '643' }]);
    expect(calls[0].url.href).toBe('https://business.tbank.ru/openapi/api/v4/bank-accounts');
    expect(calls[0].headers.Authorization).toBe('Bearer t.abc');
  });

  it('getStatement: проведённые операции за период по Москве, идёт по nextCursor до конца', async () => {
    const { fetchImpl, calls } = fakeFetch((url) => {
      const cursor = url.searchParams.get('cursor');
      if (!cursor) return { body: { operations: [{ operationId: 'a' }, { operationId: 'b' }], nextCursor: 'C2' } };
      if (cursor === 'C2') return { body: { operations: [{ operationId: 'c' }], nextCursor: null } };
      return { body: { operations: [] } };
    });
    const c = new TBusinessClient({ token: 't.abc', fetchImpl });
    const ops = await c.getStatement('40802810000000000001', '2026-10-01', '2026-10-31');
    expect(ops.map((o) => o.operationId)).toEqual(['a', 'b', 'c']);
    expect(calls).toHaveLength(2);
    const q = calls[0].url.searchParams;
    expect(calls[0].url.pathname).toBe('/openapi/api/v1/statement');
    expect(q.get('accountNumber')).toBe('40802810000000000001');
    expect(q.get('from')).toBe('2026-10-01T00:00:00+03:00');
    expect(q.get('to')).toBe('2026-10-31T23:59:59+03:00');
    expect(q.get('operationStatus')).toBe('Transaction');
    expect(q.get('cursor')).toBeNull();
    expect(calls[1].url.searchParams.get('cursor')).toBe('C2');
  });

  it('не зацикливается: банк отдаёт nextCursor и на последней (пустой) странице', async () => {
    const { fetchImpl, calls } = fakeFetch((url) =>
      url.searchParams.get('cursor') ? { body: { operations: [], nextCursor: 'C2' } } : { body: { operations: [{ operationId: 'a' }], nextCursor: 'C2' } },
    );
    const ops = await new TBusinessClient({ token: 't', fetchImpl }).getStatement('40802810000000000001', '2026-10-01', '2026-10-31');
    expect(ops.map((o) => o.operationId)).toEqual(['a']);
    expect(calls).toHaveLength(2);
  });

  it('не зацикливается: курсор повторился', async () => {
    const { fetchImpl, calls } = fakeFetch(() => ({ body: { operations: [{ operationId: 'a' }], nextCursor: 'SAME' } }));
    await new TBusinessClient({ token: 't', fetchImpl }).getStatement('40802810000000000001', '2026-10-01', '2026-10-31');
    expect(calls).toHaveLength(2);
  });

  it('сообщает о каждой странице — для логов', async () => {
    const { fetchImpl } = fakeFetch((url) =>
      url.searchParams.get('cursor') ? { body: { operations: [{}], nextCursor: null } } : { body: { operations: [{}, {}], nextCursor: 'C2' } },
    );
    const pages: number[] = [];
    await new TBusinessClient({ token: 't', fetchImpl }).getStatement('40802810000000000001', '2026-10-01', '2026-10-31', (n) => pages.push(n));
    expect(pages).toEqual([2, 1]);
  });

  it('сетевая ошибка — с кодом причины (TLS, таймаут, DNS), а не голое «fetch failed»', async () => {
    const fetchImpl = (async () => {
      throw Object.assign(new Error('fetch failed'), { cause: { code: 'SELF_SIGNED_CERT_IN_CHAIN', message: 'self-signed certificate in certificate chain' } });
    }) as unknown as typeof fetch;
    const err = await new TBusinessClient({ token: 't.abc', fetchImpl }).getAccounts().catch((e: Error) => e);
    expect(String(err)).toMatch(/bank-accounts.*SELF_SIGNED_CERT_IN_CHAIN.*self-signed/);
  });

  it('ошибка без cause — код берётся с самой ошибки', async () => {
    const fetchImpl = (async () => {
      throw Object.assign(new Error('connect ETIMEDOUT 1.2.3.4:443'), { code: 'ETIMEDOUT' });
    }) as unknown as typeof fetch;
    const err = await new TBusinessClient({ token: 't.abc', fetchImpl }).getAccounts().catch((e: Error) => e);
    expect(String(err)).toMatch(/ETIMEDOUT/);
  });

  it('не-2xx — ошибка с путём, кодом и текстом банка (без токена)', async () => {
    const { fetchImpl } = fakeFetch(() => ({ status: 403, body: { errorMessage: 'IP not allowed' } }));
    const c = new TBusinessClient({ token: 't.secret-token', fetchImpl });
    const err = await c.getAccounts().catch((e: Error) => e);
    expect(String(err)).toMatch(/bank-accounts → HTTP 403.*IP not allowed/);
    expect(String(err)).not.toContain('t.secret-token');
  });
});

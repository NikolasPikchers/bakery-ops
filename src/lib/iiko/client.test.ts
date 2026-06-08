import { describe, it, expect } from 'vitest';
import { IikoClient } from './client';

function fakeFetch(byUrl: Record<string, unknown>): typeof fetch {
  return (async (url: string) => {
    const key = Object.keys(byUrl).find((k) => String(url).includes(k));
    return new Response(JSON.stringify(key ? byUrl[key] : {}), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

describe('IikoClient', () => {
  it('apiLogin-режим: токен через /api/1, организации, OLAP→дни', async () => {
    const fetchImpl = fakeFetch({
      '/api/1/access_token': { token: 'TKN' },
      '/api/1/organizations': { organizations: [{ id: 'org1', name: 'Плюшкино' }] },
      '/api/1/reports/olap': {
        data: [
          { 'OpenDate.Typed': '2026-06-01', DishDiscountSumInt: 12345.5 },
          { 'OpenDate.Typed': '2026-06-02', DishDiscountSumInt: 9000 },
        ],
      },
    });
    const c = new IikoClient({ auth: { mode: 'apiLogin', apiLogin: 'x' }, fetchImpl });
    expect((await c.getOrganizations())[0]).toEqual({ id: 'org1', name: 'Плюшкино' });
    const days = await c.getOlapSales('org1', '2026-06-01', '2026-06-02');
    expect(days).toEqual([
      { date: '2026-06-01', amount: 12345.5 },
      { date: '2026-06-02', amount: 9000 },
    ]);
  });

  it('app-режим использует /api/v2/access_token', async () => {
    let hitV2 = false;
    const fetchImpl = (async (url: string) => {
      if (String(url).includes('/api/v2/access_token')) hitV2 = true;
      return new Response(JSON.stringify({ token: 'T', organizations: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const c = new IikoClient({ auth: { mode: 'app', appId: 'a', apiKey: 'k', clientSecret: 's' }, fetchImpl });
    await c.getOrganizations();
    expect(hitV2).toBe(true);
  });
});

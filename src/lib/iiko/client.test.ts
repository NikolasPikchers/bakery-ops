import { describe, it, expect } from 'vitest';
import { IikoClient, aggregateDailySales, splitRange } from './client';

type Call = { url: string; headers: Record<string, string>; body: Record<string, unknown> };

/** Фейковый fetch: ответ по подстроке URL, все вызовы записываются. */
function fakeFetch(byUrl: Record<string, unknown | ((body: Record<string, unknown>) => unknown)>, status: Record<string, number> = {}) {
  const calls: Call[] = [];
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const body = JSON.parse(String(init.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url: String(url), headers: init.headers as Record<string, string>, body });
    const key = Object.keys(byUrl).find((k) => String(url).includes(k));
    const v = key ? byUrl[key] : {};
    const payload = typeof v === 'function' ? (v as (b: Record<string, unknown>) => unknown)(body) : v;
    return new Response(JSON.stringify(payload), { status: (key && status[key]) || 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const auth = { appId: 'app-1', apiKey: 'key-1', clientSecret: 'secret-1' };

describe('splitRange', () => {
  it('один отрезок, если период ≤ 31 дня', () => {
    expect(splitRange('2026-11-01', '2026-11-16')).toEqual([{ from: '2026-11-01', till: '2026-11-16' }]);
  });

  it('режет длинный период на куски по 31 день включительно', () => {
    expect(splitRange('2026-02-01', '2026-04-15')).toEqual([
      { from: '2026-02-01', till: '2026-03-03' },
      { from: '2026-03-04', till: '2026-04-03' },
      { from: '2026-04-04', till: '2026-04-15' },
    ]);
  });

  it('пусто, если «по» раньше «с»', () => {
    expect(splitRange('2026-11-10', '2026-11-09')).toEqual([]);
  });
});

describe('aggregateDailySales', () => {
  it('суммирует блюда по дням, кондитерка — блюда с «\\», округление до копеек, по возрастанию даты', () => {
    const rows = [
      { 'OpenDate.Typed': '2026-11-16', DishName: '// Пир. с картошкой 77', DishDiscountSumInt: 770.1 },
      { 'OpenDate.Typed': '2026-11-16', DishName: '\\ Эклер 120', DishDiscountSumInt: 240.2 },
      { 'OpenDate.Typed': '2026-11-15', DishName: 'Капучино', DishDiscountSumInt: 180 },
      { 'OpenDate.Typed': '2026-11-16', DishName: '\\ Наполеон 150', DishDiscountSumInt: 150 },
    ];
    expect(aggregateDailySales(rows)).toEqual([
      { date: '2026-11-15', amount: 180, confectionery: 0 },
      { date: '2026-11-16', amount: 1160.3, confectionery: 390.2 },
    ]);
  });
});

describe('IikoClient', () => {
  it('токен — через /api/v2/access_token тремя ключами, один раз на клиента; дальше Bearer', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/api/v2/access_token': { token: 'TKN' },
      '/api/1/organizations': { organizations: [{ id: 'org1', name: 'Пекарня "ПЛЮШКИНО"' }] },
    });
    const c = new IikoClient({ auth, fetchImpl });
    expect(await c.getOrganizations()).toEqual([{ id: 'org1', name: 'Пекарня "ПЛЮШКИНО"' }]);
    await c.getOrganizations();

    const tokenCalls = calls.filter((x) => x.url.endsWith('/api/v2/access_token'));
    expect(tokenCalls).toHaveLength(1);
    expect(tokenCalls[0].body).toEqual({ appId: 'app-1', apiKey: 'key-1', clientSecret: 'secret-1' });
    expect(tokenCalls[0].headers.Authorization).toBeUndefined();
    const orgCall = calls.find((x) => x.url.endsWith('/api/1/organizations'))!;
    expect(orgCall.headers.Authorization).toBe('Bearer TKN');
  });

  it('getDailySales: OLAP SALES по дням и блюдам, без удалённых, период включительно', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/api/v2/access_token': { token: 'TKN' },
      '/api/reporting/v1/olap/get': {
        data: [
          { 'OpenDate.Typed': '2026-11-16', DishName: '// Пикантная 105', DishDiscountSumInt: 1050 },
          { 'OpenDate.Typed': '2026-11-16', DishName: '\\ Эклер 120', DishDiscountSumInt: 360 },
        ],
        summary: [],
      },
    });
    const c = new IikoClient({ auth, fetchImpl });
    expect(await c.getDailySales('2026-11-16', '2026-11-16')).toEqual([{ date: '2026-11-16', amount: 1410, confectionery: 360 }]);

    const olap = calls.find((x) => x.url.endsWith('/api/reporting/v1/olap/get'))!;
    expect(olap.headers.Authorization).toBe('Bearer TKN');
    expect(olap.body).toMatchObject({
      reportType: 'SALES',
      groupByRowFields: ['OpenDate.Typed', 'DishName'],
      aggregateFields: ['DishDiscountSumInt'],
    });
    expect(olap.body.filters).toEqual([
      { name: 'OpenDate.Typed', filterType: 'DateRange', periodType: 'CUSTOM', from: '2026-11-16', to: '2026-11-16', includeLow: true, includeHigh: true },
      { name: 'OrderDeleted', filterType: 'IncludeValues', values: ['NOT_DELETED'] },
      { name: 'DeletedWithWriteoff', filterType: 'IncludeValues', values: ['NOT_DELETED'] },
    ]);
  });

  it('getDailySales: длинный период — несколько запросов по ≤ 31 дню, результат склеен', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/api/v2/access_token': { token: 'TKN' },
      '/api/reporting/v1/olap/get': (body: Record<string, unknown>) => {
        const from = (body.filters as { from: string }[])[0].from;
        return { data: [{ 'OpenDate.Typed': from, DishName: 'Капучино', DishDiscountSumInt: 100 }] };
      },
    });
    const c = new IikoClient({ auth, fetchImpl });
    const days = await c.getDailySales('2026-02-01', '2026-04-15');
    expect(days.map((d) => d.date)).toEqual(['2026-02-01', '2026-03-04', '2026-04-04']);
    expect(calls.filter((x) => x.url.endsWith('/api/reporting/v1/olap/get'))).toHaveLength(3);
  });

  it('getOlapColumns: список полей SALES', async () => {
    const { fetchImpl, calls } = fakeFetch({
      '/api/v2/access_token': { token: 'TKN' },
      '/api/reporting/v1/olap/columns/get': [{ name: 'DishName', displayName: 'Блюдо', type: 'STRING' }],
    });
    const c = new IikoClient({ auth, fetchImpl });
    expect(await c.getOlapColumns()).toEqual([{ name: 'DishName', displayName: 'Блюдо', type: 'STRING' }]);
    expect(calls.find((x) => x.url.endsWith('/columns/get'))!.body).toEqual({ reportType: 'SALES' });
  });

  it('не-2xx — ошибка с путём, кодом и текстом iiko', async () => {
    const { fetchImpl } = fakeFetch(
      { '/api/v2/access_token': { errorDescription: 'Invalid credentials' } },
      { '/api/v2/access_token': 401 },
    );
    const c = new IikoClient({ auth, fetchImpl });
    await expect(c.getOrganizations()).rejects.toThrow(/\/api\/v2\/access_token → HTTP 401.*Invalid credentials/);
  });
});

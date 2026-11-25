import { describe, it, expect, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { catchUpWindow, iikoAuthFromEnv, lastLoadedIikoDay, syncIikoRevenue, syncWindow } from './sync';
import type { DailyRevenue, DishSaleDay, IikoOrg } from './types';

describe('iikoAuthFromEnv', () => {
  it('берёт три ключа из окружения', () => {
    expect(iikoAuthFromEnv({ IIKO_APP_ID: 'a', IIKO_API_KEY: 'k', IIKO_CLIENT_SECRET: 's' })).toEqual({ appId: 'a', apiKey: 'k', clientSecret: 's' });
  });

  it('понятная ошибка с именами недостающих переменных', () => {
    expect(() => iikoAuthFromEnv({ IIKO_APP_ID: 'a' })).toThrow(/IIKO_API_KEY.*IIKO_CLIENT_SECRET/);
  });
});

describe('syncWindow', () => {
  it('вчера и сегодня по Москве', () => {
    expect(syncWindow(new Date('2026-11-17T09:40:00+03:00'))).toEqual({ from: '2026-11-16', till: '2026-11-17' });
  });

  it('после полуночи по Москве — уже новые сутки, хотя в UTC ещё вчера', () => {
    expect(syncWindow(new Date('2026-11-17T22:30:00Z'))).toEqual({ from: '2026-11-17', till: '2026-11-18' });
  });

  it('через границу месяца', () => {
    expect(syncWindow(new Date('2026-12-01T10:00:00+03:00'))).toEqual({ from: '2026-11-30', till: '2026-12-01' });
  });
});

describe('catchUpWindow — догрузка дней, пропущенных из-за сбоя iiko', () => {
  const now = new Date('2026-11-25T04:00:00+03:00');

  it('всё загружено — как обычно, вчера и сегодня', () => {
    expect(catchUpWindow(now, '2026-11-25')).toEqual({ from: '2026-11-24', till: '2026-11-25' });
    expect(catchUpWindow(now, '2026-11-24')).toEqual({ from: '2026-11-24', till: '2026-11-25' });
  });

  it('iiko лежал с 23-го — окно от последнего загруженного дня', () => {
    expect(catchUpWindow(now, '2026-11-22')).toEqual({ from: '2026-11-22', till: '2026-11-25' });
  });

  it('долгий сбой — не глубже 62 дней', () => {
    expect(catchUpWindow(now, '2026-06-01')).toEqual({ from: '2026-09-25', till: '2026-11-25' });
  });

  it('данных ещё нет — как обычно', () => {
    expect(catchUpWindow(now, null)).toEqual({ from: '2026-11-24', till: '2026-11-25' });
  });
});

describe('lastLoadedIikoDay', () => {
  const fake = (revenue: string | null, dishes: string | null) => {
    const d = (iso: string | null) => ({ _max: { date: iso ? new Date(`${iso}T00:00:00.000Z`) : null } });
    const revenueAggregate = vi.fn(async () => d(revenue));
    const prisma = { revenue: { aggregate: revenueAggregate }, dishSale: { aggregate: vi.fn(async () => d(dishes)) } } as unknown as PrismaClient;
    return { prisma, revenueAggregate };
  };

  it('берёт более ранний из двух: выручку и позиции догружаем вместе', async () => {
    expect(await lastLoadedIikoDay(fake('2026-11-24', '2026-11-21').prisma)).toBe('2026-11-21');
    expect(await lastLoadedIikoDay(fake('2026-11-20', '2026-11-24').prisma)).toBe('2026-11-20');
  });

  it('выручка — только из iiko и только Плюшкино (ручная не считается загрузкой)', async () => {
    const { prisma, revenueAggregate } = fake('2026-11-24', null);
    expect(await lastLoadedIikoDay(prisma)).toBe('2026-11-24');
    expect(revenueAggregate).toHaveBeenCalledWith({ where: { pointId: 'point-1', source: 'iiko' }, _max: { date: true } });
  });

  it('пусто — null', async () => {
    expect(await lastLoadedIikoDay(fake(null, null).prisma)).toBeNull();
  });
});

function fakeClient(orgs: IikoOrg[], days: DailyRevenue[], dishes: DishSaleDay[] | Error = []) {
  const asked: { from: string; till: string }[] = [];
  const askedDishes: { from: string; till: string }[] = [];
  return {
    asked,
    askedDishes,
    client: {
      getOrganizations: async () => orgs,
      getDailySales: async (from: string, till: string) => {
        asked.push({ from, till });
        return days;
      },
      getDishSales: async (from: string, till: string) => {
        askedDishes.push({ from, till });
        if (dishes instanceof Error) throw dishes;
        return dishes;
      },
    },
  };
}

const pizza = (date: string): DishSaleDay => ({
  date, dishId: 'pizza', name: '// Пицца', dishGroup: null, qty: 2, revenue: 252, cost: 0, checks: 2, soloChecks: 1,
});

describe('syncIikoRevenue', () => {
  const plyushkino = [{ id: 'org1', name: 'Пекарня "ПЛЮШКИНО"' }];

  it('пишет дни в Плюшкино (point-1) и возвращает сводку с периодом', async () => {
    const { client, asked } = fakeClient(plyushkino, [
      { date: '2026-11-16', amount: 55163.8, confectionery: 20786 },
      { date: '2026-11-17', amount: 1995.9, confectionery: 0 },
    ]);
    const written: { pointId: string; day: DailyRevenue }[] = [];
    const upsert = async (pointId: string, day: DailyRevenue) => {
      written.push({ pointId, day });
      return 'imported' as const;
    };
    const s = await syncIikoRevenue({ client, upsert, from: '2026-11-16', till: '2026-11-17' });
    expect(asked).toEqual([{ from: '2026-11-16', till: '2026-11-17' }]);
    expect(written.map((w) => w.pointId)).toEqual(['point-1', 'point-1']);
    expect(written[0].day).toEqual({ date: '2026-11-16', amount: 55163.8, confectionery: 20786 });
    expect(s).toEqual({ from: '2026-11-16', till: '2026-11-17', days: 2, imported: 2, updated: 0 });
  });

  it('отказывается, если ключ видит не одну организацию: OLAP смешал бы точки', async () => {
    const { client } = fakeClient([...plyushkino, { id: 'org2', name: 'Корица' }], []);
    const upsert = async () => 'imported' as const;
    await expect(syncIikoRevenue({ client, upsert, from: '2026-11-16', till: '2026-11-17' })).rejects.toThrow(/2 организаци/);
  });

  it('вместе с выручкой заменяет продажи по позициям — по отрезкам iiko не длиннее 31 дня', async () => {
    const { client, askedDishes } = fakeClient(plyushkino, [], [pizza('2026-11-16')]);
    const replaced: unknown[][] = [];
    const replaceDishes = async (pointId: string, from: string, till: string, rows: DishSaleDay[]) => {
      replaced.push([pointId, from, till, rows.length]);
      return rows.length;
    };
    const s = await syncIikoRevenue({ client, upsert: async () => 'imported' as const, replaceDishes, from: '2026-01-01', till: '2026-02-15' });
    expect(askedDishes).toEqual([{ from: '2026-01-01', till: '2026-01-31' }, { from: '2026-02-01', till: '2026-02-15' }]);
    expect(replaced).toEqual([['point-1', '2026-01-01', '2026-01-31', 1], ['point-1', '2026-02-01', '2026-02-15', 1]]);
    expect(s.dishes).toEqual({ rows: 2 });
  });

  it('сбой загрузки позиций не роняет выручку: она записана, ошибка — в сводке', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const { client } = fakeClient(plyushkino, [{ date: '2026-11-16', amount: 100, confectionery: 0 }], new Error('iiko down'));
    const written: DailyRevenue[] = [];
    const s = await syncIikoRevenue({
      client,
      upsert: async (_p, d) => (written.push(d), 'imported' as const),
      replaceDishes: async () => 0,
      from: '2026-11-16',
      till: '2026-11-16',
    });
    expect(written).toHaveLength(1);
    expect(s).toMatchObject({ days: 1, imported: 1, dishes: { error: 'iiko down' } });
  });

  it('сбой выручки не мешает позициям, но наружу уходит ошибка выручки', async () => {
    const { client } = fakeClient(plyushkino, [{ date: '2026-11-16', amount: 100, confectionery: 0 }], [pizza('2026-11-16')]);
    let dishRows = 0;
    await expect(
      syncIikoRevenue({
        client,
        upsert: async () => {
          throw new Error('db revenue down');
        },
        replaceDishes: async (_p, _f, _t, rows) => (dishRows += rows.length),
        from: '2026-11-16',
        till: '2026-11-16',
      }),
    ).rejects.toThrow('db revenue down');
    expect(dishRows).toBe(1);
  });
});

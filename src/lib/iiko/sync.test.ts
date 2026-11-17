import { describe, it, expect } from 'vitest';
import { iikoAuthFromEnv, syncIikoRevenue, syncWindow } from './sync';
import type { DailyRevenue, IikoOrg } from './types';

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

function fakeClient(orgs: IikoOrg[], days: DailyRevenue[]) {
  const asked: { from: string; till: string }[] = [];
  return {
    asked,
    client: {
      getOrganizations: async () => orgs,
      getDailySales: async (from: string, till: string) => {
        asked.push({ from, till });
        return days;
      },
    },
  };
}

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
});

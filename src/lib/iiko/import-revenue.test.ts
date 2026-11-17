import { describe, it, expect } from 'vitest';
import { importRevenue } from './import-revenue';
import type { DailyRevenue } from './types';

function fakeUpsert() {
  const seen = new Set<string>();
  const calls: { pointId: string; day: DailyRevenue }[] = [];
  const upsert = async (pointId: string, day: DailyRevenue): Promise<'imported' | 'updated'> => {
    calls.push({ pointId, day });
    const k = `${pointId}|${day.date}`;
    const had = seen.has(k);
    seen.add(k);
    return had ? 'updated' : 'imported';
  };
  return { upsert, calls };
}

const days: DailyRevenue[] = [
  { date: '2026-06-01', amount: 12345.5, confectionery: 4000 },
  { date: '2026-06-02', amount: 9000, confectionery: 0 },
  { date: '2026-06-03', amount: 0, confectionery: 0 },
];

describe('importRevenue', () => {
  it('импортирует дни с выручкой > 0 вместе с кондитеркой, считает сводку', async () => {
    const { upsert, calls } = fakeUpsert();
    const s = await importRevenue({ fetchSales: async () => days, upsert, pointId: 'point-1', from: '2026-06-01', till: '2026-06-03' });
    expect(s).toEqual({ days: 2, imported: 2, updated: 0 });
    expect(calls.map((c) => c.day.date)).toEqual(['2026-06-01', '2026-06-02']);
    expect(calls[0]).toEqual({ pointId: 'point-1', day: { date: '2026-06-01', amount: 12345.5, confectionery: 4000 } });
  });

  it('идемпотентен: повторный прогон только обновляет', async () => {
    const { upsert } = fakeUpsert();
    const args = { fetchSales: async () => days, upsert, pointId: 'point-1', from: '2026-06-01', till: '2026-06-03' };
    await importRevenue(args);
    expect(await importRevenue(args)).toEqual({ days: 2, imported: 0, updated: 2 });
  });
});

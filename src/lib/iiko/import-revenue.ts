import type { DailyRevenue, RevenueImportSummary } from './types';

export type RevenueImportDeps = {
  fetchSales: (from: string, till: string) => Promise<DailyRevenue[]>;
  upsert: (pointId: string, date: string, amount: number) => Promise<'imported' | 'updated'>;
  pointId: string;
  from: string;
  till: string;
};

export async function importRevenue(deps: RevenueImportDeps): Promise<RevenueImportSummary> {
  const all = await deps.fetchSales(deps.from, deps.till);
  let imported = 0;
  let updated = 0;
  let days = 0;
  for (const d of all) {
    if (!d.date || d.amount <= 0) continue;
    days++;
    const r = await deps.upsert(deps.pointId, d.date, d.amount);
    if (r === 'imported') imported++;
    else updated++;
  }
  return { days, imported, updated };
}

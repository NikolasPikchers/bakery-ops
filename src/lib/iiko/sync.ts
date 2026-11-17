import type { PrismaClient } from '@prisma/client';
import { upsertImportedRevenue } from '../db/revenue-import-repo';
import { todayMoscow } from '../staff/dates';
import { IikoClient, type IikoAuth } from './client';
import { importRevenue } from './import-revenue';
import type { DailyRevenue, RevenueImportSummary } from './types';

/** iiko стоит только в Плюшкино — вся выручка из него идёт в point-1. */
const POINT = 'point-1';

const ENV_KEYS = { appId: 'IIKO_APP_ID', apiKey: 'IIKO_API_KEY', clientSecret: 'IIKO_CLIENT_SECRET' } as const;

/** Ключи iikoCloud из окружения; без любого из трёх — ошибка с именами недостающих. */
export function iikoAuthFromEnv(env: Record<string, string | undefined> = process.env): IikoAuth {
  const missing = Object.values(ENV_KEYS).filter((k) => !env[k]);
  if (missing.length > 0) throw new Error(`Нет ключей iiko: ${missing.join(', ')}`);
  return { appId: env[ENV_KEYS.appId]!, apiKey: env[ENV_KEYS.apiKey]!, clientSecret: env[ENV_KEYS.clientSecret]! };
}

/** Окно синхронизации: вчера и сегодня по Москве. Вчера — чтобы добрать продажи после последнего прогона. */
export function syncWindow(now: Date): { from: string; till: string } {
  const till = todayMoscow(now);
  const from = new Date(Date.parse(`${till}T00:00:00.000Z`) - 86_400_000).toISOString().slice(0, 10);
  return { from, till };
}

export type IikoSalesSource = Pick<IikoClient, 'getOrganizations' | 'getDailySales'>;
export type IikoSyncSummary = RevenueImportSummary & { from: string; till: string };

export async function syncIikoRevenue(deps: {
  client: IikoSalesSource;
  upsert: (pointId: string, day: DailyRevenue) => Promise<'imported' | 'updated'>;
  from: string;
  till: string;
}): Promise<IikoSyncSummary> {
  // OLAP не фильтруется по организации — берёт всё, что видит ключ. Ключ на две точки смешал бы выручку.
  const orgs = await deps.client.getOrganizations();
  if (orgs.length !== 1) {
    throw new Error(`Ключ iiko видит ${orgs.length} организаций (${orgs.map((o) => o.name).join(', ')}), ожидалась одна — Плюшкино`);
  }
  const summary = await importRevenue({
    fetchSales: (f, t) => deps.client.getDailySales(f, t),
    upsert: deps.upsert,
    pointId: POINT,
    from: deps.from,
    till: deps.till,
  });
  return { from: deps.from, till: deps.till, ...summary };
}

/** Боевая сборка: клиент из окружения + запись в Revenue (source iiko). */
export function runIikoSync(prisma: PrismaClient, range: { from: string; till: string }): Promise<IikoSyncSummary> {
  return syncIikoRevenue({
    client: new IikoClient({ auth: iikoAuthFromEnv() }),
    upsert: (pointId, d) => upsertImportedRevenue(prisma, { pointId, date: d.date, amount: d.amount, confectionery: d.confectionery, source: 'iiko' }),
    ...range,
  });
}

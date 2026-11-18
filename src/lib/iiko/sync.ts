import type { PrismaClient } from '@prisma/client';
import { replaceDishSales } from '../db/dish-sale-repo';
import { upsertImportedRevenue } from '../db/revenue-import-repo';
import { todayMoscow } from '../staff/dates';
import { IikoClient, splitRange, type IikoAuth } from './client';
import { importRevenue } from './import-revenue';
import type { DailyRevenue, DishSaleDay, RevenueImportSummary } from './types';

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

export type IikoSalesSource = Pick<IikoClient, 'getOrganizations' | 'getDailySales' | 'getDishSales'>;
export type DishSyncSummary = { rows: number } | { error: string };
export type IikoSyncSummary = RevenueImportSummary & { from: string; till: string; dishes?: DishSyncSummary };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export async function syncIikoRevenue(deps: {
  client: IikoSalesSource;
  upsert: (pointId: string, day: DailyRevenue) => Promise<'imported' | 'updated'>;
  /** Продажи по позициям (страница «Ассортимент»); без него — только выручка. */
  replaceDishes?: (pointId: string, from: string, till: string, rows: DishSaleDay[]) => Promise<number>;
  from: string;
  till: string;
}): Promise<IikoSyncSummary> {
  // OLAP не фильтруется по организации — берёт всё, что видит ключ. Ключ на две точки смешал бы выручку.
  const orgs = await deps.client.getOrganizations();
  if (orgs.length !== 1) {
    throw new Error(`Ключ iiko видит ${orgs.length} организаций (${orgs.map((o) => o.name).join(', ')}), ожидалась одна — Плюшкино`);
  }

  // Выручка и позиции — отдельные шаги: сбой одного не должен оставить без другого.
  let revenue: RevenueImportSummary | undefined;
  let revenueError: unknown;
  try {
    revenue = await importRevenue({
      fetchSales: (f, t) => deps.client.getDailySales(f, t),
      upsert: deps.upsert,
      pointId: POINT,
      from: deps.from,
      till: deps.till,
    });
  } catch (e) {
    revenueError = e;
  }

  let dishes: DishSyncSummary | undefined;
  if (deps.replaceDishes) {
    try {
      let rows = 0;
      // По отрезкам iiko (≤ 31 дня): история с января не держится в памяти и в одной транзакции.
      for (const part of splitRange(deps.from, deps.till)) {
        rows += await deps.replaceDishes(POINT, part.from, part.till, await deps.client.getDishSales(part.from, part.till));
      }
      dishes = { rows };
    } catch (e) {
      dishes = { error: message(e) };
      console.error('iiko dish sales failed:', message(e));
    }
  }

  if (revenueError !== undefined) throw revenueError;
  return { from: deps.from, till: deps.till, ...revenue!, ...(dishes ? { dishes } : {}) };
}

/** Боевая сборка: клиент из окружения + запись в Revenue (source iiko) и DishSale. */
export function runIikoSync(prisma: PrismaClient, range: { from: string; till: string }): Promise<IikoSyncSummary> {
  return syncIikoRevenue({
    client: new IikoClient({ auth: iikoAuthFromEnv() }),
    upsert: (pointId, d) => upsertImportedRevenue(prisma, { pointId, date: d.date, amount: d.amount, confectionery: d.confectionery, source: 'iiko' }),
    replaceDishes: (pointId, from, till, rows) => replaceDishSales(prisma, pointId, from, till, rows),
    ...range,
  });
}

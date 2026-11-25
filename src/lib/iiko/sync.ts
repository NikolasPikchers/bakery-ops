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

/** После сбоя iiko догружаем пропущенные дни, но не глубже стольких дней (два окна OLAP). */
export const MAX_CATCH_UP_DAYS = 62;

const isoDay = (d: Date) => d.toISOString().slice(0, 10);
const minusDays = (iso: string, days: number) => isoDay(new Date(Date.parse(`${iso}T00:00:00.000Z`) - days * 86_400_000));

/**
 * Окно с догрузкой: обычно вчера и сегодня, а если iiko лежал — от последнего загруженного дня
 * (он мог загрузиться не до конца), но не раньше чем за 62 дня.
 */
export function catchUpWindow(now: Date, lastLoaded: string | null): { from: string; till: string } {
  const base = syncWindow(now);
  if (!lastLoaded || lastLoaded >= base.from) return base;
  const floor = minusDays(base.till, MAX_CATCH_UP_DAYS - 1);
  return { from: lastLoaded < floor ? floor : lastLoaded, till: base.till };
}

/** Последний день, загруженный из iiko: более ранний из выручки и продаж по позициям — догружаем их вместе. */
export async function lastLoadedIikoDay(prisma: PrismaClient): Promise<string | null> {
  const [revenue, dishes] = await Promise.all([
    prisma.revenue.aggregate({ where: { pointId: POINT, source: 'iiko' }, _max: { date: true } }),
    prisma.dishSale.aggregate({ where: { pointId: POINT }, _max: { date: true } }),
  ]);
  const days = [revenue._max.date, dishes._max.date].filter((d): d is Date => d != null).map(isoDay);
  return days.length > 0 ? days.sort()[0] : null;
}

/** Окно для ночного прогона, крона и дашборда — с догрузкой пропущенного. */
export async function iikoCatchUpWindow(prisma: PrismaClient, now: Date): Promise<{ from: string; till: string }> {
  return catchUpWindow(now, await lastLoadedIikoDay(prisma));
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

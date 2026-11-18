import { todayMoscow } from '../staff/dates';

export type PeriodMonths = 1 | 3 | 6 | 12;

export const PERIOD_MONTHS: PeriodMonths[] = [1, 3, 6, 12];
const PERIOD_DAYS: Record<PeriodMonths, number> = { 1: 30, 3: 91, 6: 182, 12: 365 };
/** Тренд сравнивает последние 30 дней с предыдущими 30 — столько истории нужно всегда. */
export const TREND_DAYS = 30;

const DAY_MS = 86_400_000;
export const addDays = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** ?months= → 1 / 3 / 6 / 12; пусто или мусор — 3. */
export function parseMonths(raw: string | undefined): PeriodMonths {
  const n = Number(raw);
  return (PERIOD_MONTHS as number[]).includes(n) ? (n as PeriodMonths) : 3;
}

/** Период по вчерашний день по Москве: сегодняшние продажи ещё не закончились. */
export function assortmentPeriod(months: PeriodMonths, now: Date): { from: string; till: string } {
  const till = addDays(todayMoscow(now), -1);
  return { from: addDays(till, -(PERIOD_DAYS[months] - 1)), till };
}

/** С какой даты грузить продажи: период, но не меньше 60 дней — ради тренда. */
export function loadWindowFrom(from: string, till: string): string {
  const trendFrom = addDays(till, -(2 * TREND_DAYS - 1));
  return trendFrom < from ? trendFrom : from;
}

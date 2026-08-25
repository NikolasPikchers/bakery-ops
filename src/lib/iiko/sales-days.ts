import { splitRevenueByDays } from '@/lib/finance/revenue-period';
import { dateFromFilename, type ParsedSales } from './parse-sales-xlsx';

export type RevenueDay = { date: string; amount: number; confectionery: number };

export type SalesDaysResult =
  | { ok: true; days: RevenueDay[]; from: string; till: string }
  | { ok: false; error: string };

/** По какому дню (или дням) записывать выручку из файла.
 *  Приоритет — период из шапки выгрузки («Категории и блюда»),
 *  иначе дата из имени файла («…_ДД.ММ.ГГ.xlsx», старые «Табличные данные»).
 *  Период больше одного дня — сумма делится поровну по дням. */
export function salesDaysFromFile(filename: string, parsed: ParsedSales): SalesDaysResult {
  const period = parsed.period;
  const fallback = dateFromFilename(filename);
  const from = period?.from ?? fallback;
  const till = period?.till ?? fallback;
  if (!from || !till) return { ok: false, error: 'нет даты: ни периода в шапке, ни даты в имени файла' };

  const totals = splitRevenueByDays(from, till, parsed.total);
  if (totals.length === 0) return { ok: false, error: 'период в шапке файла некорректен' };
  const conf = splitRevenueByDays(from, till, parsed.confectionery);

  const days = totals.map((d, i) => ({ date: d.date, amount: d.amount, confectionery: conf[i]?.amount ?? 0 }));
  return { ok: true, days, from, till };
}

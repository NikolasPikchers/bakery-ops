import { prevMonth, monthDays } from './month';

/**
 * Окно сравнения «к прошлому месяцу» для KPI-дельт дашборда.
 *
 * Для текущего календарного месяца сравнивать итог 1..D с ПОЛНЫМ прошлым месяцем
 * бессмысленно (в начале месяца дельта всегда «↓80%»), поэтому берём одинаковые
 * окна дней: 1..D в выбранном месяце против 1..min(D, длина прошлого месяца) в прошлом.
 * D — число последней даты, за которую в выбранном месяце есть выручка
 * (выручка вносится позже всего); если выручки нет — сегодняшнее число.
 * Закрытые месяцы сравниваются как раньше: полный месяц к полному.
 */
export type CompareWindow =
  | { mode: 'full'; label: string }
  | { mode: 'mtd'; curUpTo: string; prevUpTo: string; label: string };

/** Сокращения месяцев для подписи бейджа («к 1–4 авг.»); май — без точки. */
const RU_MONTH_ABBR = ['янв.', 'фев.', 'мар.', 'апр.', 'май', 'июн.', 'июл.', 'авг.', 'сен.', 'окт.', 'ноя.', 'дек.'];

const pad = (n: number) => String(n).padStart(2, '0');

export function compareWindow(opts: {
  /** Выбранный месяц 'YYYY-MM'. */
  month: string;
  /** Сегодняшняя дата 'YYYY-MM-DD'. */
  todayIso: string;
  /** Последняя дата с выручкой в выбранном месяце (ISO) или null, если выручки нет. */
  lastRevenueDate: string | null;
}): CompareWindow {
  const { month, todayIso, lastRevenueDate } = opts;
  if (todayIso.slice(0, 7) !== month) return { mode: 'full', label: 'к пр. месяцу' };

  const anchor = lastRevenueDate?.startsWith(`${month}-`) ? lastRevenueDate : todayIso;
  const d = Number(anchor.slice(8, 10));
  const prev = prevMonth(month);
  const prevD = Math.min(d, monthDays(prev).length);
  const abbr = RU_MONTH_ABBR[Number(prev.slice(5, 7)) - 1];
  return {
    mode: 'mtd',
    curUpTo: `${month}-${pad(d)}`,
    prevUpTo: `${prev}-${pad(prevD)}`,
    label: prevD === 1 ? `к 1 ${abbr}` : `к 1–${prevD} ${abbr}`,
  };
}

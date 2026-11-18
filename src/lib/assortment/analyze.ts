import type { DishSaleDay } from '../iiko/types';
import { dishCategory, displayName, isServiceDish, type DishCategory } from './classify';
import { addDays, TREND_DAYS } from './period';

export type ItemStatus = 'active' | 'new' | 'stopped' | 'order';
export type AbcClass = 'A' | 'B' | 'C';

export type AssortmentItem = {
  dishId: string;
  name: string;
  category: DishCategory;
  status: ItemStatus;
  /** Только у оцениваемых (status active). */
  abc: AbcClass | null;
  revenue: number;
  perMonth: number;
  /** % выручки периода. */
  share: number;
  qty: number;
  daysSold: number;
  qtyPerSoldDay: number;
  /** % последних 30 дней к предыдущим 30; null, если в одном из окон продаж нет. */
  trend: number | null;
  /** Выручка по неделям периода, от старой к новой; последняя неделя кончается в till. */
  weekly: number[];
  checks: number;
  soloChecks: number;
  /** % чеков, где позиция куплена одна; null при < 20 чеках. */
  soloShare: number | null;
  /** Наценка к себестоимости, %; null, если себестоимость в iiko заполнена не во всех днях продаж. */
  markup: number | null;
  firstSale: string;
  lastSale: string;
};

export type AssortmentView = {
  from: string;
  till: string;
  periodDays: number;
  /** Дней в периоде, когда точка что-то продала. */
  openDays: number;
  /** Выручка периода без служебного. */
  totalRevenue: number;
  items: AssortmentItem[];
  counts: { onSale: number; A: number; B: number; C: number; new: number; stopped: number };
  /** % выручки периода у каждого класса. */
  abcShare: { A: number; B: number; C: number };
};

/** Новинка — в продаже меньше стольких дней; «не продаётся» — столько дней без продаж. */
export const NEW_DAYS = 60;
export const STOPPED_DAYS = 14;
export const MIN_SOLO_CHECKS = 20;
const A_LIMIT = 0.8;
const B_LIMIT = 0.95;

const round = (n: number, digits = 2) => Math.round(n * 10 ** digits) / 10 ** digits;
const pct = (part: number, whole: number) => (whole > 0 ? round((part / whole) * 100) : 0);
const days = (from: string, till: string) => Math.round((Date.parse(till) - Date.parse(from)) / 86_400_000) + 1;
const soloPct = (solo: number, checks: number) => (checks >= MIN_SOLO_CHECKS ? round((solo / checks) * 100, 1) : null);

type Acc = {
  name: string;
  group: string | null;
  revenue: number;
  qty: number;
  dates: Set<string>;
  last30: number;
  prev30: number;
  weekly: number[];
  checks: number;
  soloChecks: number;
  cost: number;
  costMissing: boolean;
};

export function analyzeAssortment(input: {
  rows: DishSaleDay[];
  spans: Map<string, { first: string; last: string }>;
  from: string;
  till: string;
}): AssortmentView {
  const { from, till } = input;
  const periodDays = days(from, till);
  const weeks = Math.ceil(periodDays / 7);
  const last30From = addDays(till, -(TREND_DAYS - 1));
  const prev30From = addDays(till, -(2 * TREND_DAYS - 1));

  const acc = new Map<string, Acc>();
  const openDates = new Set<string>();
  for (const r of input.rows) {
    if (isServiceDish(r.name) || r.date > till) continue;
    const a = acc.get(r.dishId) ?? {
      name: r.name, group: r.dishGroup, revenue: 0, qty: 0, dates: new Set<string>(), last30: 0, prev30: 0,
      weekly: new Array<number>(weeks).fill(0), checks: 0, soloChecks: 0, cost: 0, costMissing: false,
    };
    acc.set(r.dishId, a);
    a.name = r.name; // строки по дате — остаётся последнее имя
    a.group = r.dishGroup ?? a.group;
    if (r.date >= last30From) a.last30 += r.revenue;
    else if (r.date >= prev30From) a.prev30 += r.revenue;
    if (r.date < from) continue;
    openDates.add(r.date);
    a.revenue += r.revenue;
    a.qty += r.qty;
    a.dates.add(r.date);
    a.checks += r.checks;
    a.soloChecks += r.soloChecks;
    a.cost += r.cost;
    if (r.revenue > 0 && r.cost <= 0) a.costMissing = true;
    a.weekly[weeks - 1 - Math.floor((days(r.date, till) - 1) / 7)] += r.revenue;
  }

  const inPeriod = [...acc.entries()].filter(([, a]) => a.revenue > 0);
  const totalRevenue = round(inPeriod.reduce((s, [, a]) => s + a.revenue, 0));
  const newFrom = addDays(till, -NEW_DAYS);
  const onSaleFrom = addDays(till, -(STOPPED_DAYS - 1));

  const items: AssortmentItem[] = inPeriod
    .map(([dishId, a]) => {
      const span = input.spans.get(dishId) ?? { first: [...a.dates].sort()[0], last: [...a.dates].sort().at(-1)! };
      const category = dishCategory(a.name, a.group);
      const status: ItemStatus =
        category === 'order' ? 'order' : span.last < onSaleFrom ? 'stopped' : span.first > newFrom ? 'new' : 'active';
      return {
        dishId,
        name: displayName(a.name),
        category,
        status,
        abc: null,
        revenue: round(a.revenue),
        perMonth: Math.round((a.revenue / periodDays) * 30),
        share: pct(a.revenue, totalRevenue),
        qty: round(a.qty, 3),
        daysSold: a.dates.size,
        qtyPerSoldDay: round(a.qty / a.dates.size),
        trend: a.last30 > 0 && a.prev30 > 0 ? round((a.last30 / a.prev30 - 1) * 100, 1) : null,
        weekly: a.weekly.map((w) => round(w)),
        checks: a.checks,
        soloChecks: a.soloChecks,
        soloShare: soloPct(a.soloChecks, a.checks),
        markup: !a.costMissing && a.cost > 0 ? round(((a.revenue - a.cost) / a.cost) * 100, 1) : null,
        firstSale: span.first,
        lastSale: span.last,
      };
    })
    .sort((x, y) => y.revenue - x.revenue || x.name.localeCompare(y.name, 'ru'));

  // ABC: позиция — A, пока накопленная доля до неё < 80 %; B — < 95 %; дальше C.
  const active = items.filter((i) => i.status === 'active');
  const activeTotal = active.reduce((s, i) => s + i.revenue, 0);
  let before = 0;
  for (const i of active) {
    const share = activeTotal > 0 ? before / activeTotal : 0;
    i.abc = share < A_LIMIT ? 'A' : share < B_LIMIT ? 'B' : 'C';
    before += i.revenue;
  }

  const classRevenue = (c: AbcClass) => active.filter((i) => i.abc === c).reduce((s, i) => s + i.revenue, 0);
  const lastSaleOnSale = (i: AssortmentItem) => i.lastSale >= onSaleFrom;
  return {
    from,
    till,
    periodDays,
    openDays: openDates.size,
    totalRevenue,
    items,
    counts: {
      onSale: items.filter(lastSaleOnSale).length,
      A: active.filter((i) => i.abc === 'A').length,
      B: active.filter((i) => i.abc === 'B').length,
      C: active.filter((i) => i.abc === 'C').length,
      new: items.filter((i) => i.status === 'new').length,
      stopped: items.filter((i) => i.status === 'stopped').length,
    },
    abcShare: { A: pct(classRevenue('A'), totalRevenue), B: pct(classRevenue('B'), totalRevenue), C: pct(classRevenue('C'), totalRevenue) },
  };
}

/** «Уберу отмеченные — что потеряю»: оценка сверху, часть покупателей возьмёт другое. */
export function selectionSummary(
  items: AssortmentItem[],
  ids: Set<string>,
  totalRevenue: number,
): { count: number; perMonth: number; share: number; soloShare: number | null } {
  const picked = items.filter((i) => ids.has(i.dishId));
  const sum = (f: (i: AssortmentItem) => number) => picked.reduce((s, i) => s + f(i), 0);
  return {
    count: picked.length,
    perMonth: sum((i) => i.perMonth),
    share: pct(sum((i) => i.revenue), totalRevenue),
    soloShare: soloPct(sum((i) => i.soloChecks), sum((i) => i.checks)),
  };
}

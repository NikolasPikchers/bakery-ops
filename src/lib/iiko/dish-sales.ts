import { isServiceDish } from '../assortment/classify';
import type { DishSaleDay } from './types';

// Поля OLAP SALES, разрез «день × чек × блюдо» (сверены с /olap/columns/get, ноябрь 2026).
export const DISH_ROW_FIELDS = ['OpenDate.Typed', 'UniqOrderId.Id', 'DishId', 'DishName', 'DishGroup'] as const;
export const DISH_AGGREGATES = ['DishAmountInt', 'DishDiscountSumInt', 'ProductCostBase.ProductCost'] as const;

const round = (n: number, digits: number) => Math.round(n * 10 ** digits) / 10 ** digits;
const num = (v: unknown) => Number(v ?? 0) || 0;

type Line = { dishId: string; name: string; group: string | null; qty: number; revenue: number; cost: number };

/**
 * Строки OLAP «день × чек × блюдо» → продажи «день × блюдо».
 * soloChecks — чеки, где кроме этой позиции только служебное (пакет и т. п.): ради неё и пришли.
 */
export function aggregateDishSales(rows: Record<string, unknown>[]): DishSaleDay[] {
  const checks = new Map<string, { date: string; lines: Line[] }>();
  for (const r of rows) {
    const date = String(r['OpenDate.Typed'] ?? '').slice(0, 10);
    const dishId = String(r.DishId ?? '');
    if (!date || !dishId) continue;
    const key = `${date}|${String(r['UniqOrderId.Id'] ?? '')}`;
    const check = checks.get(key) ?? { date, lines: [] };
    check.lines.push({
      dishId,
      name: String(r.DishName ?? ''),
      group: r.DishGroup == null ? null : String(r.DishGroup),
      qty: num(r.DishAmountInt),
      revenue: num(r.DishDiscountSumInt),
      cost: num(r['ProductCostBase.ProductCost']),
    });
    checks.set(key, check);
  }

  const days = new Map<string, DishSaleDay>();
  for (const { date, lines } of checks.values()) {
    const goods = new Set(lines.filter((l) => !isServiceDish(l.name)).map((l) => l.dishId));
    const seen = new Set<string>();
    for (const l of lines) {
      const key = `${date}|${l.dishId}`;
      const d = days.get(key) ?? { date, dishId: l.dishId, name: l.name, dishGroup: l.group, qty: 0, revenue: 0, cost: 0, checks: 0, soloChecks: 0 };
      d.qty += l.qty;
      d.revenue += l.revenue;
      d.cost += l.cost;
      if (!seen.has(l.dishId)) {
        seen.add(l.dishId);
        d.checks += 1;
        if (goods.size === 1 && goods.has(l.dishId)) d.soloChecks += 1;
      }
      days.set(key, d);
    }
  }

  return [...days.values()]
    .map((d) => ({ ...d, qty: round(d.qty, 3), revenue: round(d.revenue, 2), cost: round(d.cost, 2) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.dishId.localeCompare(b.dishId));
}

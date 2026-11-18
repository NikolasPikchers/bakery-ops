import { analyzeAssortment, type AssortmentView } from '@/lib/assortment/analyze';
import { assortmentPeriod, loadWindowFrom, type PeriodMonths } from '@/lib/assortment/period';
import { getPrisma } from '@/lib/db/client';
import { loadDishSales, loadDishSpans } from '@/lib/db/dish-sale-repo';

/** iiko — только в Плюшкино. */
const POINT = 'point-1';

/** Ассортимент Плюшкино за период по вчерашний день (+ история ради тренда). */
export async function loadAssortment(months: PeriodMonths, now = new Date()): Promise<AssortmentView> {
  const prisma = getPrisma();
  const { from, till } = assortmentPeriod(months, now);
  const [rows, spans] = await Promise.all([loadDishSales(prisma, POINT, loadWindowFrom(from, till), till), loadDishSpans(prisma, POINT)]);
  return analyzeAssortment({ rows, spans, from, till });
}

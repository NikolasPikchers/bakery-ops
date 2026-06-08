import type { PrismaClient } from '@prisma/client';
import { monthRange } from '@/lib/finance/month';

export type BreakdownDay = { date: string; confectionery: number; other: number; total: number };
export type BreakdownView = { days: BreakdownDay[]; totals: { confectionery: number; other: number; total: number } };

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Дневная разбивка выручки Плюшкино (point-1) за месяц: кондитерка (\) vs пироги+прочее. */
export async function loadBreakdown(prisma: PrismaClient, month: string): Promise<BreakdownView> {
  const { start, end } = monthRange(month);
  const rows = await prisma.revenue.findMany({
    where: { pointId: 'point-1', date: { gte: new Date(`${start}T00:00:00.000Z`), lt: new Date(`${end}T00:00:00.000Z`) } },
    select: { date: true, amount: true, confectionery: true },
    orderBy: { date: 'asc' },
  });
  const days: BreakdownDay[] = rows.map((r) => {
    const total = Number(r.amount);
    const confectionery = r.confectionery == null ? 0 : Number(r.confectionery);
    return { date: iso(r.date), confectionery, other: Math.max(0, total - confectionery), total };
  });
  const totals = days.reduce(
    (a, d) => ({ confectionery: a.confectionery + d.confectionery, other: a.other + d.other, total: a.total + d.total }),
    { confectionery: 0, other: 0, total: 0 },
  );
  return { days, totals };
}

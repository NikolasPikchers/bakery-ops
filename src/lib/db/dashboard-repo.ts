import type { PrismaClient } from '@prisma/client';
import { monthRange, monthDays, prevMonth } from '@/lib/finance/month';
import { aggregateFinance, type FinanceSummary } from '@/lib/finance/dashboard-aggregate';
import { currentOstatki, topSpisaniya, agingDesserts, type MovementRow } from './ops-aggregate';

export type DashboardPoint = 'all' | 'point-1' | 'point-2';

export type DashboardView = {
  point: DashboardPoint;
  month: string;
  finance: FinanceSummary;
  ostatki: ReturnType<typeof currentOstatki>;
  spisaniya: ReturnType<typeof topSpisaniya>;
  aging: ReturnType<typeof agingDesserts>;
  sheetsQueue: { id: string; date: string; pointName: string; sheetType: string }[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function loadDashboard(
  prisma: PrismaClient,
  opts: { point: DashboardPoint; month: string; asOf: string },
): Promise<DashboardView> {
  const { point, month, asOf } = opts;
  const pointWhere = point === 'all' ? {} : { pointId: point };
  const { start, end } = monthRange(month);
  const prev = monthRange(prevMonth(month));
  const startD = new Date(`${start}T00:00:00.000Z`);
  const endD = new Date(`${end}T00:00:00.000Z`);
  const prevStartD = new Date(`${prev.start}T00:00:00.000Z`);
  const prevEndD = new Date(`${prev.end}T00:00:00.000Z`);

  const [revCur, expCur, revPrev, expPrev, movements, sheets] = await Promise.all([
    prisma.revenue.findMany({ where: { ...pointWhere, date: { gte: startD, lt: endD } }, select: { date: true, amount: true } }),
    prisma.expense.findMany({ where: { ...pointWhere, date: { gte: startD, lt: endD } }, select: { date: true, amount: true, category: true } }),
    prisma.revenue.findMany({ where: { ...pointWhere, date: { gte: prevStartD, lt: prevEndD } }, select: { amount: true } }),
    prisma.expense.findMany({ where: { ...pointWhere, date: { gte: prevStartD, lt: prevEndD } }, select: { amount: true } }),
    prisma.movement.findMany({
      where: { ...pointWhere },
      include: { point: { select: { name: true } }, product: { select: { name: true, sheetType: true, shelfLifeDays: true } } },
    }),
    prisma.sheet.findMany({ where: { ...pointWhere, status: 'needs_review' }, orderBy: { createdAt: 'desc' }, take: 20, include: { point: { select: { name: true } } } }),
  ]);

  const finance = aggregateFinance({
    monthDays: monthDays(month),
    revenues: revCur.map((r) => ({ date: iso(r.date), amount: Number(r.amount) })),
    expenses: expCur.map((e) => ({ date: iso(e.date), amount: Number(e.amount), category: e.category })),
    prevRevenue: revPrev.reduce((a, r) => a + Number(r.amount), 0),
    prevExpense: expPrev.reduce((a, e) => a + Number(e.amount), 0),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: MovementRow[] = movements.map((m: any) => ({
    pointId: m.pointId,
    pointName: m.point.name,
    productId: m.productId,
    productName: m.product.name,
    sheetType: m.product.sheetType,
    date: iso(m.date),
    prihod: m.prihod,
    ostatok: m.ostatok,
    spisanie: m.spisanie,
    shelfLifeDays: m.product.shelfLifeDays,
  }));

  return {
    point,
    month,
    finance,
    ostatki: currentOstatki(rows),
    spisaniya: topSpisaniya(rows, start, end),
    aging: agingDesserts(rows, asOf),
    sheetsQueue: sheets.map((s) => ({ id: s.id, date: iso(s.createdAt), pointName: s.point.name, sheetType: s.sheetType })),
  };
}

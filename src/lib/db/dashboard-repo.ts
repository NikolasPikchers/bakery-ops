import type { PrismaClient } from '@prisma/client';
import { monthRange, monthDays, prevMonth, monthsBack, monthShort } from '@/lib/finance/month';
import { aggregateFinance, type FinanceSummary } from '@/lib/finance/dashboard-aggregate';
import { currentOstatki, topSpisaniya, agingDesserts, type MovementRow } from './ops-aggregate';
import { computePayrollTotal } from './fot-repo';

export type DashboardPoint = 'all' | 'point-1' | 'point-2';

export type DashboardTrend = {
  labels: string[];
  revenue: number[];
  expense: number[];
  profit: number[];
  margin: number[];
};

export type DashboardView = {
  point: DashboardPoint;
  month: string;
  finance: FinanceSummary;
  trend: DashboardTrend;
  ostatki: ReturnType<typeof currentOstatki>;
  spisaniya: ReturnType<typeof topSpisaniya>;
  aging: ReturnType<typeof agingDesserts>;
  sheetsQueue: { id: string; date: string; pointName: string; sheetType: string }[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ym = (d: Date) => iso(d).slice(0, 7);

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
  const trendMonths = monthsBack(month, 6);
  const trendStartD = new Date(`${monthRange(trendMonths[0]).start}T00:00:00.000Z`);

  const [revCur, expCur, revPrev, expPrev, revTrend, expTrend, movements, sheets] = await Promise.all([
    prisma.revenue.findMany({ where: { ...pointWhere, date: { gte: startD, lt: endD } }, select: { date: true, amount: true } }),
    prisma.expense.findMany({ where: { ...pointWhere, date: { gte: startD, lt: endD } }, select: { date: true, amount: true, category: true } }),
    prisma.revenue.findMany({ where: { ...pointWhere, date: { gte: prevStartD, lt: prevEndD } }, select: { amount: true } }),
    prisma.expense.findMany({ where: { ...pointWhere, date: { gte: prevStartD, lt: prevEndD } }, select: { amount: true } }),
    prisma.revenue.findMany({ where: { ...pointWhere, date: { gte: trendStartD, lt: endD } }, select: { date: true, amount: true } }),
    prisma.expense.findMany({ where: { ...pointWhere, date: { gte: trendStartD, lt: endD } }, select: { date: true, amount: true } }),
    prisma.movement.findMany({
      where: { ...pointWhere },
      include: { point: { select: { name: true } }, product: { select: { name: true, sheetType: true, shelfLifeDays: true } } },
    }),
    prisma.sheet.findMany({ where: { ...pointWhere, status: 'needs_review' }, orderBy: { createdAt: 'desc' }, take: 20, include: { point: { select: { name: true } } } }),
  ]);

  // ФОТ (нал мимо Т-Бизнес) — Плюшкино; подмешиваем в расходы синтетической строкой 'fot'.
  const includeFot = point !== 'point-2';
  const fotCur = includeFot ? await computePayrollTotal(prisma, month) : 0;
  const fotPrev = includeFot ? await computePayrollTotal(prisma, prevMonth(month)) : 0;
  const expensesInput = expCur.map((e) => ({ date: iso(e.date), amount: Number(e.amount), category: e.category }));
  if (fotCur > 0) expensesInput.push({ date: start, amount: fotCur, category: 'fot' });

  const finance = aggregateFinance({
    monthDays: monthDays(month),
    revenues: revCur.map((r) => ({ date: iso(r.date), amount: Number(r.amount) })),
    expenses: expensesInput,
    prevRevenue: revPrev.reduce((a, r) => a + Number(r.amount), 0),
    prevExpense: expPrev.reduce((a, e) => a + Number(e.amount), 0) + fotPrev,
  });

  // 6-месячный тренд для спарклайнов KPI
  const revByMonth = new Map<string, number>();
  const expByMonth = new Map<string, number>();
  for (const r of revTrend) revByMonth.set(ym(r.date), (revByMonth.get(ym(r.date)) ?? 0) + Number(r.amount));
  for (const e of expTrend) expByMonth.set(ym(e.date), (expByMonth.get(ym(e.date)) ?? 0) + Number(e.amount));
  const trend: DashboardTrend = {
    labels: trendMonths.map(monthShort),
    revenue: trendMonths.map((mo) => revByMonth.get(mo) ?? 0),
    expense: trendMonths.map((mo) => expByMonth.get(mo) ?? 0),
    profit: trendMonths.map((mo) => (revByMonth.get(mo) ?? 0) - (expByMonth.get(mo) ?? 0)),
    margin: trendMonths.map((mo) => {
      const rv = revByMonth.get(mo) ?? 0;
      return rv === 0 ? 0 : (((rv - (expByMonth.get(mo) ?? 0)) / rv) * 100);
    }),
  };

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
    trend,
    ostatki: currentOstatki(rows),
    spisaniya: topSpisaniya(rows, start, end),
    aging: agingDesserts(rows, asOf),
    sheetsQueue: sheets.map((s) => ({ id: s.id, date: iso(s.createdAt), pointName: s.point.name, sheetType: s.sheetType })),
  };
}

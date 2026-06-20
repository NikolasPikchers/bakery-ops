import type { PrismaClient } from '@prisma/client';
import { monthRange, monthDays, prevMonth, monthsBack, monthShort } from '@/lib/finance/month';
import { aggregateFinance, type FinanceSummary } from '@/lib/finance/dashboard-aggregate';
import { computePayrollTotal, loadFot } from './fot-repo';
import { FIXED_EXPENSES, FIXED_EXPENSE_CATEGORIES, proratedMonthly } from '@/lib/finance/fixed-expenses';

export type DashboardPoint = 'all' | 'point-1' | 'point-2';

export type DashboardTrend = {
  labels: string[];
  revenue: number[];
  expense: number[];
  profit: number[];
  margin: number[];
};

export type DayPoint = { date: string; amount: number };

export type DashboardView = {
  point: DashboardPoint;
  month: string;
  finance: FinanceSummary;
  trend: DashboardTrend;
  dailyExpense: DayPoint[];
  dailyProfit: DayPoint[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);
const ym = (d: Date) => iso(d).slice(0, 7);

export async function loadDashboard(
  prisma: PrismaClient,
  opts: { point: DashboardPoint; month: string },
): Promise<DashboardView> {
  const { point, month } = opts;
  const pointWhere = point === 'all' ? {} : { pointId: point };
  const { start, end } = monthRange(month);
  const prev = monthRange(prevMonth(month));
  const startD = new Date(`${start}T00:00:00.000Z`);
  const endD = new Date(`${end}T00:00:00.000Z`);
  const prevStartD = new Date(`${prev.start}T00:00:00.000Z`);
  const prevEndD = new Date(`${prev.end}T00:00:00.000Z`);
  const trendMonths = monthsBack(month, 6);
  const trendStartD = new Date(`${monthRange(trendMonths[0]).start}T00:00:00.000Z`);

  const [revCur, expCur, revPrev, expPrev, revTrend, expTrend] = await Promise.all([
    prisma.revenue.findMany({ where: { ...pointWhere, date: { gte: startD, lt: endD } }, select: { date: true, amount: true } }),
    prisma.expense.findMany({ where: { ...pointWhere, date: { gte: startD, lt: endD } }, select: { date: true, amount: true, category: true } }),
    prisma.revenue.findMany({ where: { ...pointWhere, date: { gte: prevStartD, lt: prevEndD } }, select: { amount: true } }),
    prisma.expense.findMany({ where: { ...pointWhere, date: { gte: prevStartD, lt: prevEndD } }, select: { amount: true, category: true } }),
    prisma.revenue.findMany({ where: { ...pointWhere, date: { gte: trendStartD, lt: endD } }, select: { date: true, amount: true } }),
    prisma.expense.findMany({ where: { ...pointWhere, date: { gte: trendStartD, lt: endD } }, select: { date: true, amount: true } }),
  ]);

  // ФОТ (нал мимо Т-Бизнес) — Плюшкино; подмешиваем в расходы синтетической строкой 'fot'.
  // Только по сегодняшнюю дату (чтобы не обгонять внесённую выручку). loadFot даёт и
  // месячный итог, и разбивку по дням (dailyTotal) для графика затрат.
  const includeFot = point !== 'point-2';
  const todayIso = new Date().toISOString().slice(0, 10);
  const fotView = includeFot ? await loadFot(prisma, month, todayIso) : null;
  const fotCur = fotView?.totals.grand ?? 0;
  const fotPrev = includeFot ? await computePayrollTotal(prisma, prevMonth(month), todayIso) : 0;

  // Аренда+коммуналка — фикс, равномерно по дням (как ФОТ). Фактические проводки из
  // выписки по этим категориям на дашборде ИГНОРИРУЕМ, чтобы не задвоить. Только Плюшкино.
  const includeFixed = point !== 'point-2';
  const isDroppedFixed = (cat: string) => includeFixed && FIXED_EXPENSE_CATEGORIES.has(cat);
  const fixedRows = (m: string) =>
    includeFixed
      ? FIXED_EXPENSES.map((f) => ({ date: start, amount: proratedMonthly(f.monthly, m, todayIso), category: f.category })).filter((r) => r.amount > 0)
      : [];

  const expensesInput = expCur
    .filter((e) => !isDroppedFixed(e.category))
    .map((e) => ({ date: iso(e.date), amount: Number(e.amount), category: e.category }));
  if (fotCur > 0) expensesInput.push({ date: start, amount: fotCur, category: 'fot' });
  expensesInput.push(...fixedRows(month));

  const prevExpenseActual = expPrev.filter((e) => !isDroppedFixed(e.category)).reduce((a, e) => a + Number(e.amount), 0);
  const fixedPrev = fixedRows(prevMonth(month)).reduce((s, r) => s + r.amount, 0);

  const finance = aggregateFinance({
    monthDays: monthDays(month),
    revenues: revCur.map((r) => ({ date: iso(r.date), amount: Number(r.amount) })),
    expenses: expensesInput,
    prevRevenue: revPrev.reduce((a, r) => a + Number(r.amount), 0),
    prevExpense: prevExpenseActual + fotPrev + fixedPrev,
  });

  // Затраты и прибыль по дням (для графиков). Затраты/день = реальные траты (без
  // аренды/коммуналки) + ФОТ/день + равномерная доля аренды+коммуналки. Сумма по
  // дням сходится с месячным расходом из finance.
  const days = monthDays(month);
  const fullDays = days.length;
  const fixedExpPerDay = includeFixed ? FIXED_EXPENSES.reduce((s, f) => s + f.monthly, 0) / fullDays : 0;
  const fotByDate = new Map((fotView?.dailyTotal ?? []).map((d) => [d.date, d.amount] as [string, number]));
  const realExpByDate = new Map<string, number>();
  for (const e of expCur) {
    if (isDroppedFixed(e.category)) continue;
    const k = iso(e.date);
    realExpByDate.set(k, (realExpByDate.get(k) ?? 0) + Number(e.amount));
  }
  const revByDate = new Map<string, number>();
  for (const r of revCur) {
    const k = iso(r.date);
    revByDate.set(k, (revByDate.get(k) ?? 0) + Number(r.amount));
  }
  const dailyExpense: DayPoint[] = days.map((date) => {
    const real = realExpByDate.get(date) ?? 0;
    const fot = fotByDate.get(date) ?? 0;
    const fixed = date <= todayIso ? fixedExpPerDay : 0;
    return { date, amount: real + fot + fixed };
  });
  const dailyProfit: DayPoint[] = days.map((date, i) => ({ date, amount: (revByDate.get(date) ?? 0) - dailyExpense[i].amount }));

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

  return { point, month, finance, trend, dailyExpense, dailyProfit };
}

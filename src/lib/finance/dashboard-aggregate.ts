export type FinanceAggInput = {
  monthDays: string[];
  revenues: { date: string; amount: number }[];
  expenses: { date: string; amount: number; category: string }[];
  prevRevenue: number;
  prevExpense: number;
};

export type FinanceSummary = {
  revenue: number;
  expense: number;
  profit: number;
  margin: number | null;
  revenueDelta: number | null;
  expenseDelta: number | null;
  profitDelta: number | null;
  marginDelta: number | null;
  byDay: { date: string; revenue: number }[];
  byCategory: { category: string; amount: number; pct: number }[];
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export function aggregateFinance(input: FinanceAggInput): FinanceSummary {
  const revenue = sum(input.revenues.map((r) => r.amount));
  const expense = sum(input.expenses.map((e) => e.amount));
  const profit = revenue - expense;
  const margin = revenue === 0 ? null : (profit / revenue) * 100;

  const prevProfit = input.prevRevenue - input.prevExpense;
  const prevMargin = input.prevRevenue === 0 ? null : (prevProfit / input.prevRevenue) * 100;

  const byDay = input.monthDays.map((date) => ({
    date,
    revenue: sum(input.revenues.filter((r) => r.date === date).map((r) => r.amount)),
  }));

  const catMap = new Map<string, number>();
  for (const e of input.expenses) catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.amount);
  const byCategory = [...catMap.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([category, amount]) => ({ category, amount, pct: expense === 0 ? 0 : (amount / expense) * 100 }))
    .sort((a, b) => b.amount - a.amount);

  return {
    revenue,
    expense,
    profit,
    margin,
    revenueDelta: pctDelta(revenue, input.prevRevenue),
    expenseDelta: pctDelta(expense, input.prevExpense),
    profitDelta: pctDelta(profit, prevProfit),
    marginDelta: margin == null || prevMargin == null ? null : margin - prevMargin,
    byDay,
    byCategory,
  };
}

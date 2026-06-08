import { describe, it, expect } from 'vitest';
import { aggregateFinance } from './dashboard-aggregate';

describe('aggregateFinance', () => {
  const input = {
    monthDays: ['2026-06-01', '2026-06-02', '2026-06-03'],
    revenues: [
      { date: '2026-06-01', amount: 10000 },
      { date: '2026-06-01', amount: 5000 },
      { date: '2026-06-03', amount: 20000 },
    ],
    expenses: [
      { date: '2026-06-01', amount: 4000, category: 'produkty' },
      { date: '2026-06-02', amount: 30000, category: 'arenda' },
    ],
    prevRevenue: 25000,
    prevExpense: 20000,
  };

  it('computes revenue, expense, profit, margin', () => {
    const r = aggregateFinance(input);
    expect(r.revenue).toBe(35000);
    expect(r.expense).toBe(34000);
    expect(r.profit).toBe(1000);
    expect(r.margin).toBeCloseTo((1000 / 35000) * 100, 4);
  });

  it('computes deltas vs previous period (% for money)', () => {
    const r = aggregateFinance(input);
    expect(r.revenueDelta).toBeCloseTo(((35000 - 25000) / 25000) * 100, 4);
    expect(r.profitDelta).toBeCloseTo(((1000 - 5000) / 5000) * 100, 4); // prev profit = 25000-20000=5000
  });

  it('byDay sums revenue per day across all month days (zero-filled)', () => {
    const r = aggregateFinance(input);
    expect(r.byDay).toEqual([
      { date: '2026-06-01', revenue: 15000 },
      { date: '2026-06-02', revenue: 0 },
      { date: '2026-06-03', revenue: 20000 },
    ]);
  });

  it('byCategory sums + percentages, sorted desc, drops zero', () => {
    const r = aggregateFinance(input);
    expect(r.byCategory).toEqual([
      { category: 'arenda', amount: 30000, pct: (30000 / 34000) * 100 },
      { category: 'produkty', amount: 4000, pct: (4000 / 34000) * 100 },
    ]);
  });

  it('margin null when revenue is 0; deltas null when prev is 0', () => {
    const r = aggregateFinance({ monthDays: ['2026-06-01'], revenues: [], expenses: [], prevRevenue: 0, prevExpense: 0 });
    expect(r.revenue).toBe(0);
    expect(r.margin).toBeNull();
    expect(r.revenueDelta).toBeNull();
    expect(r.profitDelta).toBeNull();
  });
});

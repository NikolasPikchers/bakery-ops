import { describe, it, expect } from 'vitest';
import { enumerateDays, splitRevenueByDays } from './revenue-period';

describe('enumerateDays', () => {
  it('включительно; пустой при обратном диапазоне', () => {
    expect(enumerateDays('2026-06-01', '2026-06-03')).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(enumerateDays('2026-06-05', '2026-06-05')).toEqual(['2026-06-05']);
    expect(enumerateDays('2026-06-05', '2026-06-01')).toEqual([]);
  });
});

describe('splitRevenueByDays', () => {
  it('один день — вся сумма', () => {
    expect(splitRevenueByDays('2026-06-05', '2026-06-05', 1000)).toEqual([{ date: '2026-06-05', amount: 1000 }]);
  });
  it('неделя — поровну, Σ сохраняется', () => {
    const r = splitRevenueByDays('2026-06-01', '2026-06-03', 1000);
    expect(r.map((x) => x.date)).toEqual(['2026-06-01', '2026-06-02', '2026-06-03']);
    expect(Math.round(r.reduce((s, x) => s + x.amount, 0))).toBe(1000);
    expect(r[2].amount).toBeCloseTo(333.34, 2);
  });
});

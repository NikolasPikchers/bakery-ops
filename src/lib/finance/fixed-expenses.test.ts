import { describe, it, expect } from 'vitest';
import { FIXED_EXPENSES, FIXED_EXPENSE_CATEGORIES, proratedMonthly } from './fixed-expenses';

describe('fixed-expenses', () => {
  it('конфиг: аренда + коммуналка = 125 000', () => {
    expect(FIXED_EXPENSES.reduce((s, f) => s + f.monthly, 0)).toBe(125000);
    expect(FIXED_EXPENSE_CATEGORIES.has('arenda')).toBe(true);
    expect(FIXED_EXPENSE_CATEGORIES.has('kommunalka')).toBe(true);
    expect(FIXED_EXPENSE_CATEGORIES.has('produkty')).toBe(false);
  });

  it('proratedMonthly: полный месяц = monthly', () => {
    expect(proratedMonthly(77000, '2026-06')).toBe(77000); // 30 дней
    expect(proratedMonthly(48000, '2026-06')).toBe(48000);
  });

  it('proratedMonthly: «по сегодня» — пропорция дней', () => {
    // июнь, по 17-е → 17/30
    expect(proratedMonthly(77000, '2026-06', '2026-06-17')).toBe(Math.round((77000 * 17) / 30));
    expect(proratedMonthly(48000, '2026-06', '2026-06-17')).toBe(Math.round((48000 * 17) / 30));
  });

  it('proratedMonthly: прошлый месяц при upTo в будущем → полный', () => {
    expect(proratedMonthly(77000, '2026-05', '2026-06-17')).toBe(77000); // весь май ≤ 17 июня
  });

  it('proratedMonthly: месяц целиком в будущем → 0', () => {
    expect(proratedMonthly(77000, '2026-07', '2026-06-17')).toBe(0);
  });
});

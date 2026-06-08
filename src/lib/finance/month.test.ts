import { describe, it, expect } from 'vitest';
import { currentMonth, monthRange, prevMonth, nextMonth, monthDays, monthLabel } from './month';

describe('month helpers', () => {
  it('currentMonth formats YYYY-MM from a Date', () => {
    expect(currentMonth(new Date('2026-06-08T10:00:00Z'))).toBe('2026-06');
  });
  it('monthRange returns first day and first day of next month (ISO)', () => {
    expect(monthRange('2026-06')).toEqual({ start: '2026-06-01', end: '2026-07-01' });
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', end: '2027-01-01' });
  });
  it('prevMonth / nextMonth wrap years', () => {
    expect(prevMonth('2026-01')).toBe('2025-12');
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(prevMonth('2026-06')).toBe('2026-05');
  });
  it('monthDays lists every ISO day of the month', () => {
    const d = monthDays('2026-02'); // 2026 not leap → 28 days
    expect(d[0]).toBe('2026-02-01');
    expect(d.length).toBe(28);
    expect(d[27]).toBe('2026-02-28');
  });
  it('monthLabel is a ru month + year', () => {
    expect(monthLabel('2026-06')).toBe('Июнь 2026');
  });
});

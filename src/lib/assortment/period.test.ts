import { describe, expect, it } from 'vitest';
import { assortmentPeriod, loadWindowFrom, parseMonths } from './period';

describe('assortmentPeriod — период по вчерашний день по Москве', () => {
  const now = new Date('2026-11-18T10:00:00+03:00');

  it('3 месяца = 91 день по вчера', () => {
    expect(assortmentPeriod(3, now)).toEqual({ from: '2026-08-19', till: '2026-11-17' });
  });

  it('1 месяц = 30 дней, 12 месяцев = 365 дней', () => {
    expect(assortmentPeriod(1, now)).toEqual({ from: '2026-10-19', till: '2026-11-17' });
    expect(assortmentPeriod(12, now)).toEqual({ from: '2025-11-18', till: '2026-11-17' });
  });

  it('после полуночи по Москве вчера — уже другой день, хотя в UTC ещё 18-е', () => {
    expect(assortmentPeriod(1, new Date('2026-11-18T22:30:00Z')).till).toBe('2026-11-18');
  });
});

describe('parseMonths', () => {
  it('1 / 3 / 6 / 12, остальное — 3', () => {
    expect(parseMonths('6')).toBe(6);
    expect(parseMonths('12')).toBe(12);
    expect(parseMonths('7')).toBe(3);
    expect(parseMonths(undefined)).toBe(3);
  });
});

describe('loadWindowFrom — сколько истории грузить ради тренда (60 дней)', () => {
  it('короткий период тянет 60 дней назад, длинный — свой', () => {
    expect(loadWindowFrom('2026-10-19', '2026-11-17')).toBe('2026-09-19');
    expect(loadWindowFrom('2026-08-19', '2026-11-17')).toBe('2026-08-19');
  });
});

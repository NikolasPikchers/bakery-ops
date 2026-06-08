import { describe, it, expect } from 'vitest';
import { bakerBonus, cashierBonus } from './bonus';

describe('bakerBonus (от пироги+прочее)', () => {
  it('ступеньки', () => {
    expect(bakerBonus(21999)).toBe(0);
    expect(bakerBonus(22000)).toBe(100);
    expect(bakerBonus(23000)).toBe(300);
    expect(bakerBonus(25999)).toBe(300);
    expect(bakerBonus(26000)).toBe(500);
    expect(bakerBonus(31000)).toBe(800);
    expect(bakerBonus(36000)).toBe(1000);
    expect(bakerBonus(42000)).toBe(1200);
    expect(bakerBonus(99000)).toBe(1200);
  });
});

describe('cashierBonus (общая выручка; нижняя 100 от пирогов)', () => {
  it('ступеньки по общей', () => {
    expect(cashierBonus(51000, 0)).toBe(300);
    expect(cashierBonus(55999, 0)).toBe(300);
    expect(cashierBonus(56000, 0)).toBe(500);
    expect(cashierBonus(61000, 0)).toBe(800);
    expect(cashierBonus(66000, 0)).toBe(1000);
    expect(cashierBonus(71000, 0)).toBe(1200);
  });
  it('нижняя 100 если общая < 51к, но пироги ≥ 22к', () => {
    expect(cashierBonus(40000, 22000)).toBe(100);
    expect(cashierBonus(40000, 21999)).toBe(0);
    expect(cashierBonus(50000, 30000)).toBe(100);
  });
});

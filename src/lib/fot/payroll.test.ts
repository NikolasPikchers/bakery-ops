import { describe, it, expect } from 'vitest';
import { dailyPay, type PayEmployee } from './payroll';

const emp = (role: PayEmployee['role'], basePay: number): PayEmployee => ({ role, basePay });

describe('dailyPay', () => {
  it('пекарь = база + премия по пирогам', () => {
    expect(dailyPay(emp('baker', 2300), { total: 60000, pies: 31000 })).toBe(2300 + 800);
  });
  it('кассир = база + премия по общей', () => {
    expect(dailyPay(emp('cashier', 2100), { total: 56000, pies: 40000 })).toBe(2100 + 500);
  });
  it('кондитер и кухня — без премии', () => {
    expect(dailyPay(emp('confectioner', 2500), { total: 99000, pies: 99000 })).toBe(2500);
    expect(dailyPay(emp('kitchen', 1500), { total: 99000, pies: 99000 })).toBe(1500);
  });
});

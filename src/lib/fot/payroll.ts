import { bakerBonus, cashierBonus } from './bonus';

export type PayEmployee = { role: 'baker' | 'cashier' | 'kitchen' | 'confectioner'; basePay: number };
export type DayRevenue = { total: number; pies: number };

/** ЗП за одну смену: база по роли + премия (пекарь/кассир). */
export function dailyPay(emp: PayEmployee, rev: DayRevenue): number {
  if (emp.role === 'baker') return emp.basePay + bakerBonus(rev.pies);
  if (emp.role === 'cashier') return emp.basePay + cashierBonus(rev.total, rev.pies);
  return emp.basePay;
}

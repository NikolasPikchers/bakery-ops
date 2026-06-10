import { describe, it, expect } from 'vitest';
import { buildFot, type FotEmployee } from './fot-repo';
import { monthDays as monthDaysOf } from '../finance/month';

const monthDays = ['2026-06-08', '2026-06-09', '2026-06-10'];
const employees: FotEmployee[] = [
  { id: 'k', name: 'Катя', group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300, schedOffset: 0 },
  { id: 'l', name: 'Лена', group: 'confectionery', role: 'confectioner', brigade: null, basePay: 2500, schedOffset: 0 },
];
const revenueByDate = new Map([
  ['2026-06-08', { total: 60000, pies: 31000 }], // пекарь премия 800
  ['2026-06-09', { total: 40000, pies: 20000 }], // премия 0
]);

describe('buildFot', () => {
  it('считает выходы и ЗП, применяет авто-график', () => {
    const v = buildFot({ month: '2026-06', monthDays, employees, revenueByDate, overrides: new Map() });
    const katya = v.bakery.find((r) => r.employee.id === 'k')!;
    expect(katya.days.map((d) => d.present)).toEqual([true, false, false]); // бригада A: 08 W, 09-10 O (бригада B)
    expect(katya.payTotal).toBe(3100); // только 08 (2300 + премия 800)
    expect(katya.payTo15).toBe(3100); // смена до 15-го
    const lena = v.confectionery.find((r) => r.employee.id === 'l')!;
    expect(lena.days.map((d) => d.present)).toEqual([true, true, false]);
    expect(lena.payTotal).toBe(5000);
    expect(v.totals.grand).toBe(3100 + 5000);
  });

  it('override снимает смену', () => {
    const v = buildFot({ month: '2026-06', monthDays, employees, revenueByDate, overrides: new Map([['k|2026-06-08', false]]) });
    const katya = v.bakery.find((r) => r.employee.id === 'k')!;
    expect(katya.days[0].present).toBe(false);
    expect(katya.payTotal).toBe(0); // снят единственный авто-выход 08; 09-10 — бригада B
  });

  it('фикс-оклад: полный месяц = monthly, неполный — пропорция дней', () => {
    const fixedSalaries = [{ name: 'Водитель', monthly: 30000 }];
    // Полный июнь (30 дней) → ровно 30 000.
    const full = buildFot({ month: '2026-06', monthDays: monthDaysOf('2026-06'), employees: [], revenueByDate: new Map(), overrides: new Map(), fixedSalaries });
    expect(full.fixed).toEqual([{ name: 'Водитель', monthly: 30000, total: 30000 }]);
    expect(full.totals.fixedTotal).toBe(30000);
    expect(full.totals.grand).toBe(30000);
    // 10 из 30 дней (дашборд «по сегодня») → 10 000.
    const ten = buildFot({ month: '2026-06', monthDays: monthDaysOf('2026-06').slice(0, 10), employees: [], revenueByDate: new Map(), overrides: new Map(), fixedSalaries });
    expect(ten.totals.fixedTotal).toBe(10000);
    // Без фикс-окладов (дефолт) — секция пустая, grand не меняется.
    const none = buildFot({ month: '2026-06', monthDays, employees, revenueByDate, overrides: new Map() });
    expect(none.fixed).toEqual([]);
    expect(none.totals.fixedTotal).toBe(0);
  });
});

import { describe, it, expect } from 'vitest';
import { buildFot, type FotEmployee } from './fot-repo';

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
    expect(katya.days.map((d) => d.present)).toEqual([true, true, false]); // бригада A: 08,09 W, 10 O
    expect(katya.payTotal).toBe(3100 + 2300);
    expect(katya.payTo15).toBe(3100 + 2300); // обе смены до 15-го
    const lena = v.confectionery.find((r) => r.employee.id === 'l')!;
    expect(lena.days.map((d) => d.present)).toEqual([true, true, false]);
    expect(lena.payTotal).toBe(5000);
    expect(v.totals.grand).toBe(3100 + 2300 + 5000);
  });

  it('override снимает смену', () => {
    const v = buildFot({ month: '2026-06', monthDays, employees, revenueByDate, overrides: new Map([['k|2026-06-08', false]]) });
    const katya = v.bakery.find((r) => r.employee.id === 'k')!;
    expect(katya.days[0].present).toBe(false);
    expect(katya.payTotal).toBe(2300); // только 09
  });
});

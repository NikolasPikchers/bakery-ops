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

// Реальная выручка Плюшкино за конец августа и первую половину сентября 2026 (из боевой БД).
const septRevenue = new Map<string, { total: number; pies: number }>([
  ['2026-08-29', { total: 44856.5, pies: 22462.5 }], // 100
  ['2026-08-30', { total: 49553.9, pies: 31092.9 }],
  ['2026-08-31', { total: 64994.3, pies: 31643.3 }], // 800
  ['2026-09-01', { total: 178043.15, pies: 45114.15 }], // 1200
  ['2026-09-02', { total: 39323.4, pies: 25627.4 }], // 300
  ['2026-09-03', { total: 53541.25, pies: 31978.25 }], // 800
  ['2026-09-04', { total: 53843.35, pies: 31343.35 }], // 800
  ['2026-09-05', { total: 61405.3, pies: 30637.3 }], // 500
  ['2026-09-06', { total: 45301.45, pies: 31028.45 }], // 800
  ['2026-09-07', { total: 38672.45, pies: 29703.45 }], // 500
  ['2026-09-08', { total: 65046.15, pies: 36284.15 }], // 1000
  ['2026-09-09', { total: 68196.35, pies: 36467.35 }], // 1000
  ['2026-09-10', { total: 57385.9, pies: 30900.9 }], // 500
  ['2026-09-11', { total: 71836.3, pies: 44985.3 }], // 1200
  ['2026-09-12', { total: 49026.75, pies: 24415.75 }], // 300
  ['2026-09-13', { total: 55584.3, pies: 32845.3 }], // 800
  ['2026-09-14', { total: 51178.9, pies: 33394.9 }], // 800
  ['2026-09-15', { total: 60406.7, pies: 38406.7 }], // 1000 — уедет во вторую выплату
]);
const bakers: FotEmployee[] = [
  { id: 'e', name: 'Евгения', group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300, schedOffset: 0 },
  { id: 'a', name: 'Алёна', group: 'bakery', role: 'baker', brigade: 'B', basePay: 2300, schedOffset: 0 },
];
const buildSept = (overrides = new Map<string, boolean>()) =>
  buildFot({ month: '2026-09', monthDays: monthDaysOf('2026-09'), employees: bakers, revenueByDate: septRevenue, overrides });

describe('buildFot — выплаты дважды в месяц', () => {
  it('эталон сентября 2026: Евгения 21 500 ₽ 15.09, Алёна 23 600 ₽ 14.09', () => {
    const v = buildSept();
    const evg = v.bakery.find((r) => r.employee.id === 'e')!.payments[0];
    expect([evg.half, evg.payDate, evg.shifts, evg.base, evg.bonus, evg.amount]).toEqual([1, '2026-09-15', 7, 16100, 5400, 21500]);
    const alena = v.bakery.find((r) => r.employee.id === 'a')!.payments[0];
    expect([alena.half, alena.payDate, alena.shifts, alena.base, alena.bonus, alena.amount]).toEqual([1, '2026-09-14', 8, 18400, 5200, 23600]);
  });

  it('итог за месяц по строке = сумма двух выплат; в карточке — суммы по бригадам', () => {
    const v = buildSept();
    const evg = v.bakery.find((r) => r.employee.id === 'e')!;
    expect(evg.payments).toHaveLength(2);
    expect(evg.payments[1].payDate).toBe('2026-09-28'); // последняя смена бригады A в сентябре
    expect(evg.paymentsTotal).toBe(evg.payments[0].amount + evg.payments[1].amount);
    expect(v.totals.bakeryPay1).toBe(21500 + 23600);
    expect(v.totals.bakeryTotal).toBe(v.bakery.reduce((s, r) => s + r.paymentsTotal, 0));
    expect(v.totals.paymentsGrand).toBe(v.totals.bakeryTotal + v.totals.confectioneryTotal + v.totals.fixedTotal);
  });

  it('ручная правка выхода двигает дату выплаты и состав премий', () => {
    const v = buildSept(new Map([['e|2026-09-15', false]]));
    const p = v.bakery.find((r) => r.employee.id === 'e')!.payments[0];
    // период закрылся 12.09: 6 смен, премии 31.08+03+04+07+08+11 = 800+800+800+500+1000+1200
    expect([p.payDate, p.shifts, p.base, p.bonus]).toEqual(['2026-09-12', 6, 13800, 5100]);
  });

  it('у сотрудников без премии выплаты — это просто база за смены периода', () => {
    const lena: FotEmployee = { id: 'l', name: 'Лена', group: 'confectionery', role: 'confectioner', brigade: null, basePay: 2500, schedOffset: 0 };
    const v = buildFot({ month: '2026-09', monthDays: monthDaysOf('2026-09'), employees: [lena], revenueByDate: septRevenue, overrides: new Map() });
    const row = v.confectionery[0];
    expect(row.payments.every((p) => p.bonus === 0)).toBe(true);
    expect(row.paymentsTotal).toBe(row.payTotal); // без премий перенос ничего не меняет
  });

  it('дашборд не трогаем: grand и dailyTotal остаются начислением по дням месяца', () => {
    const v = buildSept();
    expect(v.totals.grand).toBe(v.bakery.reduce((s, r) => s + r.payTotal, 0));
    expect(v.dailyTotal).toHaveLength(30);
    expect(v.dailyTotal.reduce((s, d) => s + d.amount, 0)).toBeCloseTo(v.totals.grand, 6);
    const d15 = v.dailyTotal.find((d) => d.date === '2026-09-15')!;
    expect(d15.amount).toBe(3300); // одна смена Евгении: 2300 + премия 1000, без «пика выплаты»
  });

  it('выплата несёт даты своих премий, вид — даты с внесённой выручкой', () => {
    const v = buildSept();
    const evg = v.bakery.find((r) => r.employee.id === 'e')!.payments[0];
    expect(evg.bonusDates).toEqual(['2026-08-31', '2026-09-03', '2026-09-04', '2026-09-07', '2026-09-08', '2026-09-11', '2026-09-12']);
    expect(v.revenueDates[0]).toBe('2026-08-29');
    expect(v.revenueDates).toContain('2026-09-15');
    expect(v.revenueDates).toEqual([...v.revenueDates].sort());
  });
});

describe('buildFot — ручные корректировки', () => {
  const args = { month: '2026-09', monthDays: monthDaysOf('2026-09'), employees: bakers, revenueByDate: septRevenue, overrides: new Map<string, boolean>() };

  it('доплата +200 за последнюю смену попадает в текущую выплату, премия переносится как раньше', () => {
    const original = buildFot(args);
    const v = buildFot({ ...args, dayAdjustments: new Map([['e|2026-09-15', { amount: 200, note: 'Подмена' }]]) });
    const r = v.bakery.find((r) => r.employee.id === 'e')!;
    expect(r.days.find((d) => d.date === '2026-09-15')).toMatchObject({ pay: 3500, bonus: 1000, adjustment: 200, adjustmentNote: 'Подмена' });
    expect(r.payments[0]).toMatchObject({ amount: 21700, bonus: 5400, dayAdjustment: 200, adjustment: 0 });
    expect(r.payments[1].amount).toBe(original.bakery.find((r) => r.employee.id === 'e')!.payments[1].amount);
    expect(v.totals.grand).toBe(original.totals.grand + 200);
    expect(v.dailyTotal.find((d) => d.date === '2026-09-15')!.amount).toBe(3500);
  });

  it('удержание и поправки обеих выплат считаются один раз и только для своего сотрудника', () => {
    const original = buildFot(args);
    const v = buildFot({
      ...args,
      dayAdjustments: new Map([['e|2026-09-15', { amount: -100, note: null }]]),
      paymentAdjustments: new Map([['e|1', { amount: 500, note: 'Доплата' }], ['e|2', { amount: -300, note: 'Удержание' }]]),
    });
    const r = v.bakery.find((r) => r.employee.id === 'e')!;
    expect(r.payments[0]).toMatchObject({ amount: 21900, dayAdjustment: -100, adjustment: 500, adjustmentNote: 'Доплата' });
    expect(r.paymentsTotal).toBe(original.bakery.find((r) => r.employee.id === 'e')!.paymentsTotal + 100);
    expect(v.totals.grand).toBe(original.totals.grand + 100);
    expect(v.dailyTotal.reduce((sum, d) => sum + d.amount, 0)).toBeCloseTo(v.totals.grand, 6);
    expect(v.bakery.find((r) => r.employee.id === 'a')).toEqual(original.bakery.find((r) => r.employee.id === 'a'));
  });

  it('можно внести сумму в выходной и в период совсем без смен', () => {
    const overrides = new Map(args.monthDays.map((date) => [`e|${date}`, false] as const));
    const v = buildFot({ ...args, overrides, dayAdjustments: new Map([['e|2026-09-30', { amount: 200, note: null }]]), paymentAdjustments: new Map([['e|1', { amount: 300, note: null }]]) });
    const r = v.bakery.find((r) => r.employee.id === 'e')!;
    expect(r.shifts).toBe(0);
    expect(r.payTotal).toBe(500);
    expect(r.days[29]).toMatchObject({ present: false, pay: 200 });
    expect(r.payments.map((p) => [p.half, p.payDate, p.amount])).toEqual([[1, '2026-09-15', 300], [2, '2026-09-30', 200]]);
  });

  it('снятие смены сохраняет доплату, а доплата прошлого месяца не переносится повторно', () => {
    const v = buildFot({ ...args, overrides: new Map([['e|2026-09-15', false]]), dayAdjustments: new Map([['e|2026-09-15', { amount: 200, note: null }], ['e|2026-08-31', { amount: 900, note: null }]]) });
    const r = v.bakery.find((r) => r.employee.id === 'e')!;
    expect(r.days[14]).toMatchObject({ present: false, pay: 200, adjustment: 200 });
    expect(r.payments[0]).toMatchObject({ payDate: '2026-09-12', dayAdjustment: 200, amount: 19100 });
  });

  it('на дашборде по сегодня нет будущих корректировок', () => {
    const trimmed = { ...args, monthDays: args.monthDays.slice(0, 15) };
    const original = buildFot(trimmed);
    const v = buildFot({ ...trimmed, dayAdjustments: new Map([['e|2026-09-30', { amount: 200, note: null }]]), paymentAdjustments: new Map([['e|1', { amount: 300, note: null }], ['e|2', { amount: 400, note: null }]]) });
    expect(v.totals.grand).toBe(original.totals.grand + 300);
    expect(v.dailyTotal.reduce((sum, d) => sum + d.amount, 0)).toBeCloseTo(v.totals.grand, 6);
    expect(v.totals.paymentsGrand).toBe(original.totals.paymentsGrand + 900);
  });
});

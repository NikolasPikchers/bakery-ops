import { describe, it, expect } from 'vitest';
import { actualShifts, payPeriods, payPeriodAmounts } from './pay-periods';
import type { SchedEmployee } from './schedule';
import type { DayRevenue } from './payroll';

const baker = (brigade: 'A' | 'B'): SchedEmployee => ({ role: 'baker', group: 'bakery', brigade, schedOffset: 0 });

// Реальная выручка Плюшкино (total / «пироги+прочее») за конец августа и первую половину
// сентября 2026 — из боевой БД. Премии пекаря: 22к→100, 23к→300, 26к→500, 31к→800, 36к→1000, 42к→1200.
const REVENUE = new Map<string, DayRevenue>([
  ['2026-08-28', { total: 60801.3, pies: 33633.3 }],
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
  ['2026-09-15', { total: 60406.7, pies: 38406.7 }], // 1000 — переносится в следующую выплату
]);

/** Смены сотрудника за август + сентябрь 2026 (авто-график, с опциональными правками). */
const septShifts = (emp: SchedEmployee, overrides: Record<string, boolean> = {}) => {
  const aug = Array.from({ length: 31 }, (_, i) => `2026-08-${String(i + 1).padStart(2, '0')}`);
  const sep = Array.from({ length: 30 }, (_, i) => `2026-09-${String(i + 1).padStart(2, '0')}`);
  return actualShifts(emp, [...aug, ...sep], (d) => overrides[d]);
};

describe('actualShifts', () => {
  it('берёт авто-график, override перекрывает его в обе стороны', () => {
    const days = ['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04'];
    expect(actualShifts(baker('B'), days)).toEqual(['2026-09-01', '2026-09-02']);
    const ov: Record<string, boolean> = { '2026-09-02': false, '2026-09-03': true };
    expect(actualShifts(baker('B'), days, (d) => ov[d])).toEqual(['2026-09-01', '2026-09-03']);
  });
});

describe('payPeriods', () => {
  it('две выплаты месяца: граница = последняя фактическая смена на отсечку или раньше', () => {
    const ps = payPeriods('2026-09', septShifts(baker('A')));
    expect(ps.map((p) => p.half)).toEqual([1, 2]);
    expect(ps[0].cutoff).toBe('2026-09-15');
    expect(ps[0].payDate).toBe('2026-09-15');
    expect(ps[0].shiftDates).toEqual(['03', '04', '07', '08', '11', '12', '15'].map((d) => `2026-09-${d}`));
    expect(ps[1].cutoff).toBe('2026-09-30');
    expect(ps[1].payDate).toBe('2026-09-28'); // последняя смена бригады A в сентябре — 28-е
  });

  it('у бригады B та же отсечка закрывается 14-м — границы бригад разные', () => {
    const ps = payPeriods('2026-09', septShifts(baker('B')));
    expect(ps[0].payDate).toBe('2026-09-14');
    expect(ps[0].shiftDates).toEqual(['01', '02', '05', '06', '09', '10', '13', '14'].map((d) => `2026-09-${d}`));
    expect(ps[1].payDate).toBe('2026-09-30');
  });

  it('премии сдвинуты на одну смену назад: первая выплата тянет премию с конца прошлого месяца', () => {
    const [p1, p2] = payPeriods('2026-09', septShifts(baker('A')));
    expect(p1.bonusDates).toEqual(['2026-08-31', ...['03', '04', '07', '08', '11', '12'].map((d) => `2026-09-${d}`)]);
    // премия за 15.09 уехала во вторую выплату
    expect(p2.bonusDates[0]).toBe('2026-09-15');
    // число премий всегда равно числу смен
    expect(p1.bonusDates).toHaveLength(p1.shiftDates.length);
    expect(p2.bonusDates).toHaveLength(p2.shiftDates.length);
  });

  it('ручная правка выхода двигает границу периода', () => {
    const ps = payPeriods('2026-09', septShifts(baker('A'), { '2026-09-15': false }));
    expect(ps[0].payDate).toBe('2026-09-12');
    expect(ps[0].shiftDates).toEqual(['03', '04', '07', '08', '11', '12'].map((d) => `2026-09-${d}`));
    expect(ps[0].bonusDates).toEqual(['2026-08-31', ...['03', '04', '07', '08', '11'].map((d) => `2026-09-${d}`)]);
    // 15-е стало выходным → вторая выплата начинается с 16-го и тянет премию за 12.09
    expect(ps[1].shiftDates[0]).toBe('2026-09-16');
    expect(ps[1].bonusDates[0]).toBe('2026-09-12');
  });

  it('правка, добавляющая смену в конце месяца, двигает дату второй выплаты', () => {
    const plain = payPeriods('2026-09', septShifts(baker('A')));
    expect(plain[1].payDate).toBe('2026-09-28');
    const extra = payPeriods('2026-09', septShifts(baker('A'), { '2026-09-30': true }));
    expect(extra[1].payDate).toBe('2026-09-30');
    expect(extra[1].bonusDates.at(-1)).toBe('2026-09-28');
  });

  it('февраль: вторая отсечка — 28-е (29-е в високосный), но платят в последнюю смену', () => {
    const feb = payPeriods('2027-02', ['2027-02-03', '2027-02-14', '2027-02-15', '2027-02-27']);
    expect(feb.map((p) => p.cutoff)).toEqual(['2027-02-15', '2027-02-28']);
    expect(feb.map((p) => p.payDate)).toEqual(['2027-02-15', '2027-02-27']);
    const leap = payPeriods('2028-02', ['2028-02-15', '2028-02-29']);
    expect(leap.map((p) => p.cutoff)).toEqual(['2028-02-15', '2028-02-29']);
    expect(leap.map((p) => p.payDate)).toEqual(['2028-02-15', '2028-02-29']);
  });

  it('31-дневный месяц: вторая отсечка 31-е', () => {
    const ps = payPeriods('2027-01', ['2027-01-15', '2027-01-16', '2027-01-31']);
    expect(ps.map((p) => p.cutoff)).toEqual(['2027-01-15', '2027-01-31']);
    expect(ps.map((p) => p.payDate)).toEqual(['2027-01-15', '2027-01-31']);
    expect(ps[1].shiftDates).toEqual(['2027-01-16', '2027-01-31']);
    expect(ps[1].bonusDates).toEqual(['2027-01-15', '2027-01-16']);
  });

  it('нет смен до 15-го → одна выплата за весь месяц', () => {
    const ps = payPeriods('2026-09', ['2026-08-31', '2026-09-20', '2026-09-21']);
    expect(ps).toHaveLength(1);
    expect(ps[0].half).toBe(2);
    expect(ps[0].shiftDates).toEqual(['2026-09-20', '2026-09-21']);
    expect(ps[0].bonusDates).toEqual(['2026-08-31', '2026-09-20']);
  });

  it('нет предыдущей смены (первый месяц сотрудника) → премий на одну меньше', () => {
    const ps = payPeriods('2026-09', ['2026-09-01', '2026-09-02']);
    expect(ps[0].bonusDates).toEqual(['2026-09-01']);
  });

  it('смены без выходов вообще → выплат нет', () => {
    expect(payPeriods('2026-09', [])).toEqual([]);
    expect(payPeriods('2026-09', ['2026-08-31'])).toEqual([]);
  });
});

describe('payPeriodAmounts — эталонные выплаты сентября 2026 (первая отсечка)', () => {
  it('Евгения (бригада A): 7 смен × 2300 + премии 5 400 = 21 500 ₽', () => {
    const ps = payPeriods('2026-09', septShifts(baker('A')));
    const [p1] = payPeriodAmounts({ role: 'baker', basePay: 2300 }, ps, REVENUE);
    expect(p1.payDate).toBe('2026-09-15');
    expect(p1.base).toBe(16100);
    expect(p1.bonus).toBe(5400);
    expect(p1.amount).toBe(21500);
  });

  it('Алёна (бригада B): 8 смен × 2300 + премии 5 200 = 23 600 ₽', () => {
    const ps = payPeriods('2026-09', septShifts(baker('B')));
    const [p1] = payPeriodAmounts({ role: 'baker', basePay: 2300 }, ps, REVENUE);
    expect(p1.payDate).toBe('2026-09-14');
    expect(p1.base).toBe(18400);
    expect(p1.bonus).toBe(5200);
    expect(p1.amount).toBe(23600);
  });

  it('без премии (кухня/кондитер) выплата = база за смены периода', () => {
    const ps = payPeriods('2026-09', ['2026-08-30', '2026-09-01', '2026-09-02', '2026-09-20']);
    const [p1, p2] = payPeriodAmounts({ role: 'confectioner', basePay: 2500 }, ps, REVENUE);
    expect([p1.base, p1.bonus, p1.amount]).toEqual([5000, 0, 5000]);
    expect([p2.base, p2.bonus, p2.amount]).toEqual([2500, 0, 2500]);
  });

  it('премия за день без выручки = 0 (нет данных — нет премии)', () => {
    const ps = payPeriods('2026-09', ['2026-09-20', '2026-09-21']);
    const [p] = payPeriodAmounts({ role: 'baker', basePay: 2300 }, ps, new Map());
    expect(p.amount).toBe(4600);
  });
});

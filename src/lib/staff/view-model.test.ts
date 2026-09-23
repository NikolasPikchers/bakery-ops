import { describe, it, expect } from 'vitest';
import type { FotEmployee, FotPayment, FotRow } from '@/lib/db/fot-repo';
import { monthDays } from '@/lib/finance/month';
import { dayState, employeeCard, hasBonusScheme, isPreliminary, staffRevenueRows } from './view-model';

const EVG: FotEmployee = { id: 'e', name: 'Евгения', group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300, schedOffset: 0 };
const LYUDA: FotEmployee = { id: 'l', name: 'Людмила', group: 'bakery', role: 'kitchen', brigade: null, basePay: 1500, schedOffset: 0 };

/** Дни месяца: worked — {число → оплата за смену}, остальные дни — выходные. */
function days(month: string, worked: Record<number, number>): FotRow['days'] {
  return monthDays(month).map((date) => {
    const pay = worked[Number(date.slice(8, 10))];
    return { date, present: pay !== undefined, pay: pay ?? 0 };
  });
}
function row(employee: FotEmployee, d: FotRow['days'], payments: FotPayment[] = []): FotRow {
  return { employee, days: d, shifts: d.filter((x) => x.present).length, payTotal: 0, payments, paymentsTotal: payments.reduce((s, p) => s + p.amount, 0) };
}
const pay = (half: 1 | 2, payDate: string, base: number, bonus: number, bonusDates: string[]): FotPayment => ({
  half,
  payDate,
  shifts: 0,
  base,
  bonus,
  amount: base + bonus,
  bonusDates,
});

describe('hasBonusScheme', () => {
  it('премия только у пекарей и кассиров', () => {
    expect(hasBonusScheme('baker')).toBe(true);
    expect(hasBonusScheme('cashier')).toBe(true);
    expect(hasBonusScheme('kitchen')).toBe(false);
    expect(hasBonusScheme('confectioner')).toBe(false);
  });
});

describe('dayState', () => {
  const base = { date: '2026-09-10', present: true, pay: 3100, basePay: 2300, bonusScheme: true, revenueEntered: true, today: '2026-09-20' };
  it('не смена → выходной, даже если выручка есть', () => expect(dayState({ ...base, present: false })).toEqual({ kind: 'off' }));
  it('будущая смена → план', () => expect(dayState({ ...base, date: '2026-09-25', revenueEntered: false })).toEqual({ kind: 'planned' }));
  it('кухня: прошедшая смена без суммы', () =>
    expect(dayState({ ...base, bonusScheme: false, pay: 1500, basePay: 1500 })).toEqual({ kind: 'worked' }));
  it('выручка внесена → премия дня = оплата − база', () => expect(dayState(base)).toEqual({ kind: 'bonus', amount: 800 }));
  it('выручка внесена, до порога не дотянули → +0', () => expect(dayState({ ...base, pay: 2300 })).toEqual({ kind: 'bonus', amount: 0 }));
  it('смена прошла, выручки нет → ждёт выручку', () =>
    expect(dayState({ ...base, pay: 2300, revenueEntered: false })).toEqual({ kind: 'pending' }));
  it('сегодняшняя смена без выручки → ждёт выручку, а не план', () =>
    expect(dayState({ ...base, date: '2026-09-20', pay: 2300, revenueEntered: false })).toEqual({ kind: 'pending' }));
});

describe('isPreliminary', () => {
  const rev = new Set(['2026-08-31', '2026-09-03']);
  const p = { payDate: '2026-09-15', bonusDates: ['2026-08-31', '2026-09-03'] };
  it('дата выплаты впереди → предварительно', () =>
    expect(isPreliminary(p, { today: '2026-09-14', bonusScheme: true, revenueDates: rev })).toBe(true));
  it('день выплаты, все премии посчитаны → окончательно', () =>
    expect(isPreliminary(p, { today: '2026-09-15', bonusScheme: true, revenueDates: rev })).toBe(false));
  it('нет выручки за день из прошлого месяца → предварительно', () =>
    expect(isPreliminary(p, { today: '2026-09-20', bonusScheme: true, revenueDates: new Set(['2026-09-03']) })).toBe(true));
  it('у кухни выручка на выплату не влияет', () =>
    expect(isPreliminary(p, { today: '2026-09-20', bonusScheme: false, revenueDates: new Set() })).toBe(false));
});

describe('employeeCard', () => {
  it('Евгения, сентябрь: подпись, календарь с понедельника, выплата', () => {
    const r = row(EVG, days('2026-09', { 3: 3100, 4: 3100, 20: 2300, 21: 2300 }), [pay(1, '2026-09-15', 16100, 5400, ['2026-08-31', '2026-09-03', '2026-09-04'])]);
    const c = employeeCard(r, { month: '2026-09', today: '2026-09-20', revenueDates: new Set(['2026-08-31', '2026-09-03', '2026-09-04']) });
    expect(c).toMatchObject({ id: 'e', name: 'Евгения', subtitle: 'пекарь · бригада A', monthTotal: 21500 });
    expect(c.cells[0]).toBeNull(); // 1 сентября 2026 — вторник
    expect(c.cells[1]).toEqual({ date: '2026-09-01', day: 1, state: { kind: 'off' } });
    expect(c.cells[3]?.state).toEqual({ kind: 'bonus', amount: 800 });
    expect(c.cells[20]?.state).toEqual({ kind: 'pending' }); // сегодня, выручки ещё нет
    expect(c.cells[21]?.state).toEqual({ kind: 'planned' });
    expect(c.payouts).toEqual([
      { half: 1, title: '1-я выплата · 15 сен', amount: 21500, base: 16100, bonus: 5400, showBonus: true, preliminary: false },
    ]);
  });

  it('смен в месяце нет → ни одной выплаты, все дни выходные', () => {
    const c = employeeCard(row(EVG, days('2026-09', {})), { month: '2026-09', today: '2026-09-20', revenueDates: new Set() });
    expect(c.payouts).toEqual([]);
    expect(c.monthTotal).toBe(0);
    expect(c.cells.every((x) => x === null || x.state.kind === 'off')).toBe(true);
  });

  it('Людмила (кухня): смены без суммы, выплата без премий и без «предварительно» из-за выручки', () => {
    const r = row(LYUDA, days('2026-09', { 1: 1500, 2: 1500 }), [pay(1, '2026-09-15', 16500, 0, ['2026-08-31', '2026-09-01'])]);
    const c = employeeCard(r, { month: '2026-09', today: '2026-09-20', revenueDates: new Set() });
    expect(c.subtitle).toBe('кухня');
    expect(c.cells[1]?.state).toEqual({ kind: 'worked' });
    expect(c.payouts[0]).toMatchObject({ showBonus: false, preliminary: false });
  });

  it('будущий месяц: все смены — план, выплата предварительная', () => {
    const r = row(EVG, days('2026-10', { 1: 2300, 2: 2300 }), [pay(1, '2026-10-14', 4600, 0, ['2026-09-28', '2026-10-01'])]);
    const c = employeeCard(r, { month: '2026-10', today: '2026-09-23', revenueDates: new Set() });
    const shifts = c.cells.filter((x) => x !== null && x.state.kind !== 'off');
    expect(shifts).toHaveLength(2);
    expect(shifts.every((x) => x!.state.kind === 'planned')).toBe(true);
    expect(c.payouts[0].preliminary).toBe(true);
  });

  it('прошедший месяц целиком внесён: ни «…», ни «предварительно»', () => {
    const r = row(EVG, days('2026-08', { 30: 3100, 31: 3100 }), [pay(2, '2026-08-31', 4600, 800, ['2026-08-30'])]);
    const c = employeeCard(r, { month: '2026-08', today: '2026-09-23', revenueDates: new Set(['2026-08-30', '2026-08-31']) });
    expect(c.cells.some((x) => x?.state.kind === 'pending')).toBe(false);
    expect(c.payouts[0].preliminary).toBe(false);
  });
});

describe('staffRevenueRows', () => {
  it('дата, день недели и суммы как есть', () => {
    expect(staffRevenueRows([{ date: '2026-09-01', confectionery: 132929, other: 45114, total: 178043 }])).toEqual([
      { date: '2026-09-01', label: '01.09', weekday: 'вт', other: 45114, confectionery: 132929, total: 178043 },
    ]);
  });
});

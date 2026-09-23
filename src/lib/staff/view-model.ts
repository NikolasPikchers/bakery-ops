import type { FotEmployee, FotRow } from '@/lib/db/fot-repo';
import type { BreakdownDay } from '@/lib/db/breakdown-repo';
import { calendarCells, dayMonth, dayMonthWord, weekdayShort } from './dates';

export type DayState = { kind: 'off' } | { kind: 'planned' } | { kind: 'worked' } | { kind: 'bonus'; amount: number } | { kind: 'pending' };

type Role = FotEmployee['role'];

/** Премия бывает только у пекарей и кассиров; у кухни и кондитеров — одна база. */
export function hasBonusScheme(role: Role): boolean {
  return role === 'baker' || role === 'cashier';
}

/** Состояние дня в календаре сотрудника — правила по порядку из раздела 4 спеки. */
export function dayState(a: { date: string; present: boolean; pay: number; basePay: number; bonusScheme: boolean; revenueEntered: boolean; today: string }): DayState {
  if (!a.present) return { kind: 'off' };
  if (a.date > a.today) return { kind: 'planned' };
  if (!a.bonusScheme) return { kind: 'worked' };
  if (a.revenueEntered) return { kind: 'bonus', amount: a.pay - a.basePay };
  return { kind: 'pending' };
}

/** «Предварительно»: выплата ещё впереди или за день какой-то из её премий нет выручки. */
export function isPreliminary(p: { payDate: string; bonusDates: string[] }, a: { today: string; bonusScheme: boolean; revenueDates: ReadonlySet<string> }): boolean {
  return p.payDate > a.today || (a.bonusScheme && p.bonusDates.some((d) => !a.revenueDates.has(d)));
}

export type CalendarCell = { date: string; day: number; state: DayState } | null;
export type PayoutLine = { half: 1 | 2; title: string; amount: number; base: number; bonus: number; showBonus: boolean; preliminary: boolean };
export type EmployeeCardModel = { id: string; name: string; subtitle: string; cells: CalendarCell[]; payouts: PayoutLine[]; monthTotal: number };

const ROLE_LABEL: Record<Role, string> = { baker: 'пекарь', cashier: 'кассир', kitchen: 'кухня', confectioner: 'кондитер' };

export function employeeCard(row: FotRow, ctx: { month: string; today: string; revenueDates: ReadonlySet<string> }): EmployeeCardModel {
  const e = row.employee;
  const bonusScheme = hasBonusScheme(e.role);
  const byDate = new Map(row.days.map((d) => [d.date, d]));
  const cells: CalendarCell[] = calendarCells(ctx.month).map((date) => {
    if (date === null) return null;
    const d = byDate.get(date);
    const state = dayState({
      date,
      present: d?.present ?? false,
      pay: d?.pay ?? 0,
      basePay: e.basePay,
      bonusScheme,
      revenueEntered: ctx.revenueDates.has(date),
      today: ctx.today,
    });
    return { date, day: Number(date.slice(8, 10)), state };
  });
  const payouts: PayoutLine[] = row.payments.map((p) => ({
    half: p.half,
    title: `${p.half}-я выплата · ${dayMonthWord(p.payDate)}`,
    amount: p.amount,
    base: p.base,
    bonus: p.bonus,
    showBonus: bonusScheme,
    preliminary: isPreliminary(p, { today: ctx.today, bonusScheme, revenueDates: ctx.revenueDates }),
  }));
  const subtitle = bonusScheme && e.brigade ? `${ROLE_LABEL[e.role]} · бригада ${e.brigade}` : ROLE_LABEL[e.role];
  return { id: e.id, name: e.name, subtitle, cells, payouts, monthTotal: row.paymentsTotal };
}

export type StaffRevenueRow = { date: string; label: string; weekday: string; other: number; confectionery: number; total: number };

export function staffRevenueRows(days: BreakdownDay[]): StaffRevenueRow[] {
  return days.map((d) => ({ date: d.date, label: dayMonth(d.date), weekday: weekdayShort(d.date), other: d.other, confectionery: d.confectionery, total: d.total }));
}

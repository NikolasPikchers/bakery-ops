import { monthDays as monthDaysOf } from '@/lib/finance/month';
import { autoPresent, type SchedEmployee } from './schedule';
import { dailyPay, type PayEmployee, type DayRevenue } from './payroll';

/**
 * Зарплату выдают дважды в месяц. Отсечки — 15-е и последний день месяца, но период
 * каждого сотрудника закрывается ЕГО последней фактической сменой на отсечку или раньше
 * (поэтому у бригад A и B даты выплат разные). Начало периода — день после конца прошлого.
 *
 * Премии: платят в день последней смены, а выручка этого дня ещё не известна, поэтому
 * в выплату входят премии за все смены периода КРОМЕ последней плюс премия за последнюю
 * смену предыдущего периода. Эквивалентно: премия за смену X выплачивается в том периоде,
 * в который попадает СЛЕДУЮЩАЯ смена этого сотрудника после X. Число премий в выплате
 * всегда равно числу смен (кроме самой первой выплаты сотрудника — до неё смен не было).
 */
export type PayPeriod = {
  /** 1 — отсечка 15-е, 2 — отсечка последний день месяца. */
  half: 1 | 2;
  /** Отсечка периода. */
  cutoff: string;
  /** Дата выплаты = последняя фактическая смена периода. */
  payDate: string;
  /** Смены периода — по ним начисляется база. */
  shiftDates: string[];
  /** Даты смен, чьи премии входят в эту выплату (сдвиг на одну смену назад). */
  bonusDates: string[];
};

export type PayPeriodAmount = PayPeriod & { base: number; bonus: number; amount: number };

/** Фактические смены за перечисленные дни: ручная правка поверх авто-графика. */
export function actualShifts(
  emp: SchedEmployee,
  days: string[],
  override?: (date: string) => boolean | undefined,
): string[] {
  return days.filter((d) => override?.(d) ?? autoPresent(emp, d));
}

/**
 * Периоды выплат месяца. `shifts` — фактические смены сотрудника; список должен захватывать
 * хвост предыдущего месяца, иначе в первую выплату не попадёт перенесённая премия.
 */
export function payPeriods(month: string, shifts: string[]): PayPeriod[] {
  const days = monthDaysOf(month);
  const firstDay = days[0];
  const lastDay = days[days.length - 1];
  const sorted = [...new Set(shifts)].sort();
  const inMonth = sorted.filter((d) => d >= firstDay && d <= lastDay);
  const before = sorted.filter((d) => d < firstDay);
  const prevShift = before.length > 0 ? before[before.length - 1] : null;

  const cutoffs: { half: 1 | 2; cutoff: string }[] = [
    { half: 1, cutoff: `${month}-15` },
    { half: 2, cutoff: lastDay },
  ];
  const periods: PayPeriod[] = [];
  let from = 0;
  for (const { half, cutoff } of cutoffs) {
    let to = from - 1;
    while (to + 1 < inMonth.length && inMonth[to + 1] <= cutoff) to++;
    if (to < from) continue; // ни одной смены в периоде — выплаты нет
    const shiftDates = inMonth.slice(from, to + 1);
    const prior = from === 0 ? prevShift : inMonth[from - 1];
    periods.push({
      half,
      cutoff,
      payDate: shiftDates[shiftDates.length - 1],
      shiftDates,
      bonusDates: [...(prior ? [prior] : []), ...shiftDates.slice(0, -1)],
    });
    from = to + 1;
  }
  return periods;
}

/** Суммы выплат: база за смены периода + премии за даты из `bonusDates`. */
export function payPeriodAmounts(
  emp: PayEmployee,
  periods: PayPeriod[],
  revenueByDate: ReadonlyMap<string, DayRevenue>,
): PayPeriodAmount[] {
  const bonusOn = (date: string) => dailyPay(emp, revenueByDate.get(date) ?? { total: 0, pies: 0 }) - emp.basePay;
  return periods.map((p) => {
    const base = p.shiftDates.length * emp.basePay;
    const bonus = p.bonusDates.reduce((s, d) => s + bonusOn(d), 0);
    return { ...p, base, bonus, amount: base + bonus };
  });
}

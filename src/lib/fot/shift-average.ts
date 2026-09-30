import type { FotRow } from '@/lib/db/fot-repo';

export type ShiftAverage = { id: string; name: string; shifts: number; avgPay: number; avgBonus: number; leader: boolean };
export type ShiftAverages = { bakers: ShiftAverage[]; cashiers: ShiftAverage[] };

/**
 * Средняя ЗП за смену за месяц — по людям, пекари и кассиры отдельно (база и шкалы премий
 * у них разные). Считаются только отработанные дни с внесённой выручкой: без неё премия дня
 * неизвестна. Кухня и кондитеры не попадают.
 */
export function shiftAverages(rows: FotRow[], revenueDates: ReadonlySet<string>): ShiftAverages {
  return { bakers: averagesOf(rows, 'baker', revenueDates), cashiers: averagesOf(rows, 'cashier', revenueDates) };
}

function averagesOf(rows: FotRow[], role: 'baker' | 'cashier', revenueDates: ReadonlySet<string>): ShiftAverage[] {
  const list = rows
    .filter((r) => r.employee.role === role)
    .flatMap((r) => {
      const counted = r.days.filter((d) => d.present && revenueDates.has(d.date));
      if (counted.length === 0) return [];
      const mean = counted.reduce((s, d) => s + d.pay, 0) / counted.length;
      return [{ id: r.employee.id, name: r.employee.name, shifts: counted.length, avgPay: Math.round(mean), avgBonus: Math.round(mean - r.employee.basePay) }];
    })
    .sort((a, b) => b.avgPay - a.avgPay || a.name.localeCompare(b.name, 'ru'));
  // Лидер — у максимума списка; если все равны (или человек один), лидера нет.
  const max = Math.max(...list.map((x) => x.avgPay));
  const min = Math.min(...list.map((x) => x.avgPay));
  return list.map((x) => ({ ...x, leader: max > min && x.avgPay === max }));
}

/** «смена / смены / смен» для числа n. */
export function shiftsWord(n: number): string {
  const d10 = n % 10;
  const d100 = n % 100;
  if (d10 === 1 && d100 !== 11) return 'смена';
  if (d10 >= 2 && d10 <= 4 && (d100 < 12 || d100 > 14)) return 'смены';
  return 'смен';
}

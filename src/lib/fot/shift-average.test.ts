import { describe, it, expect } from 'vitest';
import type { FotEmployee, FotRow } from '@/lib/db/fot-repo';
import { shiftAverages, shiftsWord } from './shift-average';

const emp = (id: string, name: string, role: FotEmployee['role'], basePay: number): FotEmployee => ({
  id,
  name,
  group: role === 'confectioner' ? 'confectionery' : 'bakery',
  role,
  brigade: role === 'baker' || role === 'cashier' ? 'A' : null,
  basePay,
  schedOffset: 0,
});

/** Строка табеля: смены {дата → оплата за смену}, `off` — дни без выхода. */
function row(employee: FotEmployee, shifts: Record<string, number>, off: string[] = []): FotRow {
  const days = [...Object.entries(shifts).map(([date, pay]) => ({ date, present: true, pay })), ...off.map((date) => ({ date, present: false, pay: 0 }))];
  return { employee, days, shifts: Object.keys(shifts).length, payTotal: 0, payments: [], paymentsTotal: 0 };
}

// Выручку внесли за 1–5 сентября.
const REV = new Set(['2026-09-01', '2026-09-02', '2026-09-03', '2026-09-04', '2026-09-05']);

describe('shiftAverages', () => {
  it('считаются только отработанные дни с внесённой выручкой', () => {
    const r = row(
      emp('evg', 'Евгения', 'baker', 2300),
      // 20.09 — смена прошла, выручку не внесли; 25.09 — смена по графику, ещё впереди
      { '2026-09-01': 3500, '2026-09-02': 2600, '2026-09-20': 2300, '2026-09-25': 2300 },
      ['2026-09-03'], // выходной, хотя выручка за день есть
    );
    expect(shiftAverages([r], REV).bakers).toEqual([{ id: 'evg', name: 'Евгения', shifts: 2, avgPay: 3050, avgBonus: 750, leader: false }]);
  });

  it('кухня и кондитер не попадают, пекари и кассиры — в своих списках', () => {
    const a = shiftAverages(
      [
        row(emp('katya', 'Катя', 'baker', 2300), { '2026-09-01': 3500 }),
        row(emp('natasha', 'Наташа', 'cashier', 2100), { '2026-09-01': 3300 }),
        row(emp('lyuda', 'Людмила', 'kitchen', 1500), { '2026-09-01': 1500 }),
        row(emp('lena', 'Лена', 'confectioner', 2500), { '2026-09-01': 2500 }),
      ],
      REV,
    );
    expect(a.bakers.map((x) => x.name)).toEqual(['Катя']);
    expect(a.cashiers.map((x) => x.name)).toEqual(['Наташа']);
  });

  it('по убыванию средней ЗП, при равенстве — по имени', () => {
    const a = shiftAverages(
      [
        row(emp('katya', 'Катя', 'baker', 2300), { '2026-09-01': 2600 }),
        row(emp('evg', 'Евгения', 'baker', 2300), { '2026-09-01': 3100 }),
        row(emp('valya', 'Валентина', 'baker', 2300), { '2026-09-01': 3300 }),
        row(emp('alena', 'Алёна', 'baker', 2300), { '2026-09-01': 3100 }),
      ],
      REV,
    );
    expect(a.bakers.map((x) => x.name)).toEqual(['Валентина', 'Алёна', 'Евгения', 'Катя']);
  });

  it('лидер — у максимума в своём списке, при ничьей на максимуме лидеров несколько', () => {
    const a = shiftAverages(
      [
        row(emp('natasha', 'Наташа', 'cashier', 2100), { '2026-09-01': 3100 }),
        row(emp('olya', 'Оля', 'cashier', 2100), { '2026-09-01': 2600 }),
        row(emp('kristina', 'Кристина', 'cashier', 2100), { '2026-09-01': 3100 }),
        row(emp('katya', 'Катя', 'baker', 2300), { '2026-09-01': 3500 }),
        row(emp('evg', 'Евгения', 'baker', 2300), { '2026-09-01': 3100 }),
      ],
      REV,
    );
    // У кассиров максимум 3 100 — ниже, чем у пекарей, но лидеры у них свои.
    expect(a.cashiers.map((x) => [x.name, x.leader])).toEqual([
      ['Кристина', true],
      ['Наташа', true],
      ['Оля', false],
    ]);
    expect(a.bakers.map((x) => [x.name, x.leader])).toEqual([
      ['Катя', true],
      ['Евгения', false],
    ]);
  });

  it('все равны — лидера нет', () => {
    const a = shiftAverages(
      [row(emp('katya', 'Катя', 'baker', 2300), { '2026-09-01': 3100 }), row(emp('evg', 'Евгения', 'baker', 2300), { '2026-09-02': 3100 })],
      REV,
    );
    expect(a.bakers.map((x) => x.leader)).toEqual([false, false]);
  });

  it('один человек в списке — лидера нет', () => {
    const a = shiftAverages([row(emp('natasha', 'Наташа', 'cashier', 2100), { '2026-09-01': 3100 })], REV);
    expect(a.cashiers).toEqual([{ id: 'natasha', name: 'Наташа', shifts: 1, avgPay: 3100, avgBonus: 1000, leader: false }]);
  });

  it('сотрудник без засчитанных смен в список не попадает', () => {
    const a = shiftAverages(
      [
        row(emp('katya', 'Катя', 'baker', 2300), { '2026-09-01': 3100 }),
        row(emp('alena', 'Алёна', 'baker', 2300), { '2026-09-20': 2300 }), // смена есть, выручку за день не внесли
        row(emp('valya', 'Валентина', 'baker', 2300), {}, ['2026-09-01']), // ни одного выхода
      ],
      REV,
    );
    expect(a.bakers).toEqual([{ id: 'katya', name: 'Катя', shifts: 1, avgPay: 3100, avgBonus: 800, leader: false }]);
    expect(a.cashiers).toEqual([]);
  });

  it('средняя ЗП и средняя премия округляются до рубля', () => {
    const a = shiftAverages(
      [
        // (3500 + 3100 + 2600) / 3 = 3066,67 → 3067; премия 766,67 → 767
        row(emp('katya', 'Катя', 'baker', 2300), { '2026-09-01': 3500, '2026-09-02': 3100, '2026-09-03': 2600 }),
        // (2900 + 2400 + 2600) / 3 = 2633,33 → 2633; премия 533,33 → 533
        row(emp('natasha', 'Наташа', 'cashier', 2100), { '2026-09-01': 2900, '2026-09-02': 2400, '2026-09-03': 2600 }),
      ],
      REV,
    );
    expect(a.bakers[0]).toMatchObject({ shifts: 3, avgPay: 3067, avgBonus: 767 });
    expect(a.cashiers[0]).toMatchObject({ shifts: 3, avgPay: 2633, avgBonus: 533 });
  });
});

describe('shiftsWord', () => {
  const said = (n: number) => `${n} ${shiftsWord(n)}`;
  it('смена / смены / смен по правилам русского счёта', () => {
    expect([1, 21, 101].map(said)).toEqual(['1 смена', '21 смена', '101 смена']);
    expect([2, 3, 4, 22, 34].map(said)).toEqual(['2 смены', '3 смены', '4 смены', '22 смены', '34 смены']);
    expect([0, 5, 11, 12, 13, 14, 20, 111, 112].map(said)).toEqual(['0 смен', '5 смен', '11 смен', '12 смен', '13 смен', '14 смен', '20 смен', '111 смен', '112 смен']);
  });
});

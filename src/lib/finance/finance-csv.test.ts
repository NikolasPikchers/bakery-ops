import { describe, it, expect } from 'vitest';
import { parseRevenueCsv, parseExpenseCsv } from './finance-csv';

describe('parseRevenueCsv', () => {
  it('parses rows, normalizes date/point/amount, collects errors', () => {
    const csv = [
      'date,point,amount,note',
      '2026-06-05,Плюшкино,18500,суббота',
      '06.06.2026,point-2,"12 300,50"',
      'bad,Корица,100',
      '2026-06-07,НетТакой,100',
    ].join('\n');
    const r = parseRevenueCsv(csv);
    expect(r.rows).toEqual([
      { pointId: 'point-1', date: '2026-06-05', amount: 18500, note: 'суббота' },
      { pointId: 'point-2', date: '2026-06-06', amount: 12300.5, note: undefined },
    ]);
    expect(r.errors.map((e) => e.line)).toEqual([4, 5]);
  });
});

describe('parseExpenseCsv', () => {
  it('parses category by label/key; unknown category -> prochee with note', () => {
    const csv = [
      'date,point,category,amount,note',
      '2026-06-05,Плюшкино,Продукты,4200,мука',
      '2026-06-05,Корица,fot,30000',
      '2026-06-05,Плюшкино,Реклама,1500',
    ].join('\n');
    const r = parseExpenseCsv(csv);
    expect(r.rows[0]).toEqual({ pointId: 'point-1', date: '2026-06-05', amount: 4200, category: 'produkty', note: 'мука' });
    expect(r.rows[1]).toMatchObject({ category: 'fot', amount: 30000 });
    expect(r.rows[2]).toMatchObject({ category: 'prochee' });
    expect(r.rows[2].note).toContain('Реклама');
    expect(r.errors).toEqual([]);
  });
});

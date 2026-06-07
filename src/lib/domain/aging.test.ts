import { describe, it, expect } from 'vitest';
import { computeAging, type MovementPoint } from './aging';

const hist = (rows: Array<[string, number | null, number | null]>): MovementPoint[] =>
  rows.map(([date, prihod, ostatok]) => ({ date, prihod, ostatok }));

describe('computeAging', () => {
  it('последний приход 6 дней назад, остаток > 0 → stale при пороге 5', () => {
    const h = hist([
      ['2026-06-01', 10, 5],
      ['2026-06-03', null, 5],
    ]);
    expect(computeAging(h, '2026-06-07', 5)).toMatchObject({
      currentOstatok: 5,
      lastPrihodDate: '2026-06-01',
      ageDays: 6,
      stale: true,
    });
  });

  it('свежий приход вчера → не stale', () => {
    const h = hist([['2026-06-06', 6, 6]]);
    expect(computeAging(h, '2026-06-07', 5)).toMatchObject({ ageDays: 1, stale: false });
  });

  it('остаток 0 → не stale, возраст null', () => {
    const h = hist([['2026-06-01', 10, 0]]);
    expect(computeAging(h, '2026-06-07', 5)).toMatchObject({
      currentOstatok: 0,
      ageDays: null,
      stale: false,
    });
  });

  it('ровно на пороге (5 дней) — ещё не stale', () => {
    const h = hist([['2026-06-02', 4, 4]]);
    expect(computeAging(h, '2026-06-07', 5)).toMatchObject({ ageDays: 5, stale: false });
  });

  it('порог настраивается на товар', () => {
    const h = hist([['2026-06-04', 3, 3]]);
    expect(computeAging(h, '2026-06-07', 2)).toMatchObject({ ageDays: 3, stale: true });
  });

  it('остаток > 0, но прихода в истории нет → возраст null, не stale', () => {
    const h = hist([
      ['2026-06-01', null, 3],
      ['2026-06-04', null, 3],
    ]);
    expect(computeAging(h, '2026-06-07', 5)).toMatchObject({
      currentOstatok: 3,
      lastPrihodDate: null,
      ageDays: null,
      stale: false,
    });
  });
});

import { describe, it, expect } from 'vitest';
import { currentOstatki, topSpisaniya, agingDesserts, type MovementRow } from './ops-aggregate';

const rows: MovementRow[] = [
  { pointId: 'point-1', pointName: 'Плюшкино', productId: 'p1', productName: 'Самса', sheetType: 'pies', date: '2026-06-05', prihod: 24, ostatok: 9, spisanie: 0, shelfLifeDays: null },
  { pointId: 'point-1', pointName: 'Плюшкино', productId: 'p1', productName: 'Самса', sheetType: 'pies', date: '2026-06-06', prihod: 8, ostatok: 2, spisanie: 3, shelfLifeDays: null },
  { pointId: 'point-2', pointName: 'Корица', productId: 'd1', productName: 'Бенто Орео', sheetType: 'desserts', date: '2026-06-01', prihod: 5, ostatok: 5, spisanie: 0, shelfLifeDays: 5 },
  { pointId: 'point-2', pointName: 'Корица', productId: 'd1', productName: 'Бенто Орео', sheetType: 'desserts', date: '2026-06-04', prihod: 0, ostatok: 3, spisanie: 0, shelfLifeDays: 5 },
];

describe('currentOstatki', () => {
  it('takes the latest non-null ostatok per product/point, sorted by name', () => {
    const r = currentOstatki(rows);
    expect(r).toEqual([
      { productName: 'Бенто Орео', pointName: 'Корица', ostatok: 3 },
      { productName: 'Самса', pointName: 'Плюшкино', ostatok: 2 },
    ]);
  });
});

describe('topSpisaniya', () => {
  it('sums spisanie within the month range per product, desc, drops zero', () => {
    const r = topSpisaniya(rows, '2026-06-01', '2026-07-01');
    expect(r).toEqual([{ productName: 'Самса', pointName: 'Плюшкино', total: 3 }]);
  });
});

describe('agingDesserts', () => {
  it('flags Корица desserts with ostatok>0 and age beyond shelf life', () => {
    const r = agingDesserts(rows, '2026-06-12');
    expect(r).toEqual([{ productName: 'Бенто Орео', ageDays: 11, ostatok: 3, stale: true }]);
  });
  it('ignores pies and zero-stock items', () => {
    const r = agingDesserts(rows.filter((x) => x.sheetType === 'pies'), '2026-06-12');
    expect(r).toEqual([]);
  });
});

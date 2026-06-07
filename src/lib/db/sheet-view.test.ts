import { describe, it, expect } from 'vitest';
import { buildSheetView, type RawSheetData } from './sheet-view';

const data: RawSheetData = {
  sheet: {
    id: 's1',
    pointId: 'point-1',
    sheetType: 'pies',
    imageUrl: 'http://blob/x.jpg',
    dates: [new Date('2026-06-05'), new Date('2026-06-06')],
    status: 'needs_review',
    point: { name: 'Точка 1' },
  },
  movements: [
    {
      productId: 'p1',
      date: new Date('2026-06-05'),
      prihod: 24,
      ostatok: 9,
      spisanie: 0,
      soldCalc: null,
      confidence: 0.6,
      rawCell: { prihod: '24', ostatok: '9', spisanie: '' },
      product: { name: 'Самса' },
    },
    {
      productId: 'p1',
      date: new Date('2026-06-06'),
      prihod: 8,
      ostatok: 2,
      spisanie: 0,
      soldCalc: 15,
      confidence: 0.95,
      rawCell: { prihod: '8', ostatok: '2', spisanie: '' },
      product: { name: 'Самса' },
    },
  ],
  unknownLines: [{ id: 'u1', rawText: 'Эклер 5', status: 'pending', mappedProductId: null }],
  products: [{ id: 'p1', name: 'Самса' }],
};

describe('buildSheetView', () => {
  it('pivots movements into product rows × date columns with raw + confidence', () => {
    const v = buildSheetView(data);
    expect(v.dates).toEqual(['2026-06-05', '2026-06-06']);
    expect(v.rows).toHaveLength(1);
    const row = v.rows[0];
    expect(row.productId).toBe('p1');
    expect(row.productName).toBe('Самса');
    expect(row.cells['2026-06-05']).toEqual({
      prihod: 24,
      ostatok: 9,
      spisanie: 0,
      soldCalc: null,
      confidence: 0.6,
      raw: { prihod: '24', ostatok: '9', spisanie: '' },
      low: true,
    });
    expect(row.cells['2026-06-06'].low).toBe(false);
  });

  it('marks low confidence below 0.8', () => {
    const v = buildSheetView(data);
    expect(v.rows[0].cells['2026-06-05'].low).toBe(true);
  });

  it('passes through unknown lines and products', () => {
    const v = buildSheetView(data);
    expect(v.unknownLines).toEqual([{ id: 'u1', rawText: 'Эклер 5', status: 'pending', mappedProductId: null }]);
    expect(v.products).toEqual([{ id: 'p1', name: 'Самса' }]);
  });
});

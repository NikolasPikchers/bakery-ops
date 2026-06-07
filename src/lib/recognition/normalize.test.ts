import { describe, it, expect } from 'vitest';
import { normalizeRecognition } from './normalize';
import type { RawRecognition } from './schema';
import type { CatalogEntry } from './match-product';

const catalog: CatalogEntry[] = [{ id: 'p2', name: 'Пицца открытая' }];

const raw: RawRecognition = {
  pointHint: 'Точка 1',
  sheetType: 'pies',
  dates: ['2026-06-06'],
  rows: [
    {
      productName: 'Пицца открытая',
      cells: [{ date: '2026-06-06', prihod: '24+12+6', ostatok: '4-3', spisanie: null }],
    },
    {
      productName: 'Неведомая позиция',
      cells: [{ date: '2026-06-06', prihod: '5', ostatok: null, spisanie: null }],
    },
  ],
  unknownLines: [{ rawText: 'тесто 3кг', note: null }],
  warnings: ['кривое фото снизу'],
};

describe('normalizeRecognition', () => {
  it('разбирает числа через parseQuantity и сопоставляет каталог', () => {
    const res = normalizeRecognition(raw, catalog);
    const row = res.rows[0];
    expect(row.matchedProductId).toBe('p2');
    expect(row.matchConfidence).toBe(1);
    expect(row.cells[0].prihod.value).toBe(42);
    expect(row.cells[0].ostatok.value).toBe(1);
    expect(row.cells[0].spisanie.value).toBeNull();
  });
  it('строка без совпадения → matchedProductId null (на ревью)', () => {
    const res = normalizeRecognition(raw, catalog);
    expect(res.rows[1].matchedProductId).toBeNull();
  });
  it('пробрасывает unknownLines, warnings, dates, pointHint, sheetType', () => {
    const res = normalizeRecognition(raw, catalog);
    expect(res.unknownLines).toEqual([{ rawText: 'тесто 3кг', note: null }]);
    expect(res.warnings).toEqual(['кривое фото снизу']);
    expect(res.dates).toEqual(['2026-06-06']);
    expect(res.pointHint).toBe('Точка 1');
    expect(res.sheetType).toBe('pies');
  });
});

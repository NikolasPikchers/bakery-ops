import { describe, it, expect } from 'vitest';
import { recognitionToRecords, type PersistContext } from './recognition-to-records';
import type { RecognitionResult } from '@/lib/recognition/schema';
import type { ParsedQuantity } from '@/lib/domain/types';

const q = (value: number | null, raw: string): ParsedQuantity => ({
  value, raw, parts: value === null ? [] : [value], ambiguous: false,
});

const ctx: PersistContext = {
  pointId: 'pt1', sheetId: 'sh1', imageUrl: 'blob://x', imageHash: 'abc',
  source: 'telegram', uploadedBy: null,
};

const result: RecognitionResult = {
  pointHint: 'Точка 1',
  sheetType: 'pies',
  dates: ['2026-06-05', '2026-06-06'],
  rows: [
    {
      productName: 'Пицца открытая',
      matchedProductId: 'p16',
      matchConfidence: 1,
      cells: [
        { date: '2026-06-05', prihod: q(34, '24+10'), ostatok: q(5, '5'), spisanie: q(null, '') },
        { date: '2026-06-06', prihod: q(42, '24+12+6'), ostatok: q(1, '4-3'), spisanie: q(null, '') },
      ],
    },
    {
      productName: 'Неведомая',
      matchedProductId: null,
      matchConfidence: 0,
      cells: [{ date: '2026-06-06', prihod: q(5, '5'), ostatok: q(null, ''), spisanie: q(null, '') }],
    },
  ],
  unknownLines: [{ rawText: 'тесто 3кг', note: null }],
  warnings: [],
};

describe('recognitionToRecords', () => {
  it('строит Sheet со статусом needs_review (есть несопоставленная строка и unknownLines)', () => {
    const recs = recognitionToRecords(result, ctx);
    expect(recs.sheet).toMatchObject({
      id: 'sh1', pointId: 'pt1', sheetType: 'pies', imageHash: 'abc',
      source: 'telegram', status: 'needs_review',
    });
    expect(recs.sheet.dates).toEqual(['2026-06-05', '2026-06-06']);
    expect(recs.sheet.rawRecognition).toBe(result);
  });

  it('movements только по сопоставленным строкам; soldCalc внутри листа', () => {
    const recs = recognitionToRecords(result, ctx);
    expect(recs.movements).toHaveLength(2);
    const [d5, d6] = recs.movements;
    expect(d5).toMatchObject({ productId: 'p16', date: '2026-06-05', prihod: 34, ostatok: 5, soldCalc: null });
    expect(d6).toMatchObject({ productId: 'p16', date: '2026-06-06', prihod: 42, ostatok: 1, soldCalc: 46 });
    expect(d6.rawCell).toEqual({ prihod: '24+12+6', ostatok: '4-3', spisanie: '' });
    expect(d6.confidence).toBe(1);
    expect(d6.manuallyEdited).toBe(false);
  });

  it('unknownLines переносятся со статусом pending', () => {
    const recs = recognitionToRecords(result, ctx);
    expect(recs.unknownLines).toEqual([
      { sheetId: 'sh1', pointId: 'pt1', date: null, rawText: 'тесто 3кг', parsedNumbers: null, status: 'pending' },
    ]);
  });

  it('статус recognized, когда всё сопоставлено, без ambiguous и без unknownLines', () => {
    const clean: RecognitionResult = {
      pointHint: null, sheetType: 'pies', dates: ['2026-06-06'],
      rows: [{
        productName: 'Самса', matchedProductId: 'p5', matchConfidence: 1,
        cells: [{ date: '2026-06-06', prihod: q(8, '8'), ostatok: q(9, '9'), spisanie: q(null, '') }],
      }],
      unknownLines: [], warnings: [],
    };
    expect(recognitionToRecords(clean, ctx).sheet.status).toBe('recognized');
  });
});

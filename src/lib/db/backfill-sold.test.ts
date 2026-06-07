import { describe, it, expect } from 'vitest';
import { backfillCrossSheetSold } from './backfill-sold';
import type { MovementRecord } from '@/lib/persistence/recognition-to-records';

const mv = (date: string, prihod: number | null, ostatok: number | null, soldCalc: number | null): MovementRecord => ({
  pointId: 'pt1', productId: 'p1', date, prihod, ostatok, spisanie: null, soldCalc,
  sheetId: 'sh1', confidence: 1, rawCell: { prihod: '', ostatok: '', spisanie: '' }, manuallyEdited: false,
});

describe('backfillCrossSheetSold', () => {
  it('первый день листа без базы → досчитывает из вчерашнего остатка БД', async () => {
    const out = await backfillCrossSheetSold([mv('2026-06-06', 8, 9, null)], async () => 3);
    expect(out[0].soldCalc).toBe(2);
  });
  it('нет данных за прошлый день → остаётся null', async () => {
    const out = await backfillCrossSheetSold([mv('2026-06-06', 8, 9, null)], async () => null);
    expect(out[0].soldCalc).toBeNull();
  });
  it('уже посчитанный внутри листа soldCalc не трогаем', async () => {
    const out = await backfillCrossSheetSold([mv('2026-06-06', 8, 9, 5)], async () => 100);
    expect(out[0].soldCalc).toBe(5);
  });
  it('досчитывает только самый ранний день каждого товара', async () => {
    const out = await backfillCrossSheetSold([mv('2026-06-05', 10, 5, null), mv('2026-06-06', 8, 9, 4)], async () => 2);
    expect(out[0].soldCalc).toBe(7);
    expect(out[1].soldCalc).toBe(4);
  });
});

import { describe, it, expect } from 'vitest';
import { computeEditedMovements } from './apply-edits';

describe('computeEditedMovements', () => {
  it('chains soldCalc within the batch and uses prevOstatok from DB for the earliest date', async () => {
    // DB says ostatok before 2026-06-05 for (point-1,p1) was 3.
    const getPrev = async () => 3;
    const out = await computeEditedMovements(
      'point-1',
      [
        { productId: 'p1', date: '2026-06-06', prihod: 8, ostatok: 2, spisanie: 0 },
        { productId: 'p1', date: '2026-06-05', prihod: 8, ostatok: 9, spisanie: 0 },
      ],
      getPrev,
    );
    // Sorted by date per product. 05: sold = 3 + 8 - 0 - 9 = 2. 06: sold = 9 + 8 - 0 - 2 = 15.
    const byDate = Object.fromEntries(out.map((m) => [m.date, m.soldCalc]));
    expect(byDate['2026-06-05']).toBe(2);
    expect(byDate['2026-06-06']).toBe(15);
    expect(out.every((m) => m.manuallyEdited)).toBe(true);
  });

  it('leaves soldCalc null when there is no prior ostatok base', async () => {
    const getPrev = async () => null;
    const out = await computeEditedMovements(
      'point-1',
      [{ productId: 'p1', date: '2026-06-05', prihod: 8, ostatok: 9, spisanie: 0 }],
      getPrev,
    );
    expect(out[0].soldCalc).toBeNull();
  });
});

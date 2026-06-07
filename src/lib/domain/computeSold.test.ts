import { describe, it, expect } from 'vitest';
import { computeSold } from './computeSold';

describe('computeSold', () => {
  it('реальный кейс с листа (Самса 6.06): 3 + 8 − 0 − 9 = 2', () => {
    expect(computeSold({ prevOstatok: 3, prihod: 8, spisanie: 0, ostatok: 9 }))
      .toMatchObject({ sold: 2 });
  });

  it('нет вчерашнего остатка → null с reason no-base', () => {
    expect(computeSold({ prevOstatok: null, prihod: 8, spisanie: 0, ostatok: 3 }))
      .toMatchObject({ sold: null, reason: 'no-base' });
  });

  it('нет сегодняшнего остатка → null с reason no-base', () => {
    expect(computeSold({ prevOstatok: 3, prihod: 8, spisanie: 0, ostatok: null }))
      .toMatchObject({ sold: null, reason: 'no-base' });
  });

  it('null приход/списание трактуются как 0', () => {
    expect(computeSold({ prevOstatok: 5, prihod: null, spisanie: null, ostatok: 2 }))
      .toMatchObject({ sold: 3 });
  });

  it('учитывает списание', () => {
    expect(computeSold({ prevOstatok: 0, prihod: 15, spisanie: 3, ostatok: 9 }))
      .toMatchObject({ sold: 3 });
  });

  it('отрицательное продано → anomaly', () => {
    expect(computeSold({ prevOstatok: 1, prihod: 0, spisanie: 0, ostatok: 5 }))
      .toMatchObject({ sold: -4, anomaly: true });
  });
});

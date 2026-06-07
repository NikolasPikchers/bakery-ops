import { describe, it, expect } from 'vitest';
import { RawRecognitionSchema } from './schema';

describe('RawRecognitionSchema', () => {
  it('принимает валидный сырой ответ', () => {
    const raw = {
      pointHint: 'Точка 1',
      sheetType: 'pies',
      dates: ['2026-06-05', '2026-06-06'],
      rows: [
        {
          productName: 'Самса',
          cells: [
            { date: '2026-06-05', prihod: '8', ostatok: '3', spisanie: null },
            { date: '2026-06-06', prihod: '8', ostatok: '9', spisanie: null },
          ],
        },
      ],
      unknownLines: [{ rawText: 'тесто 3кг', note: null }],
      warnings: [],
    };
    expect(() => RawRecognitionSchema.parse(raw)).not.toThrow();
  });

  it('отклоняет неизвестный sheetType', () => {
    expect(() =>
      RawRecognitionSchema.parse({
        pointHint: null, sheetType: 'bread', dates: [], rows: [], unknownLines: [], warnings: [],
      }),
    ).toThrow();
  });
});

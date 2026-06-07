import { describe, it, expect } from 'vitest';
import { recognizeSheet, type RecognitionClient } from './recognize-sheet';
import type { CatalogEntry } from './match-product';

const catalog: CatalogEntry[] = [{ id: 'p2', name: 'Пицца открытая' }];

function stubClient(parsedOutput: unknown): RecognitionClient {
  return {
    messages: {
      parse: async () => ({ parsed_output: parsedOutput }),
    },
  };
}

describe('recognizeSheet (стаб клиента)', () => {
  it('нормализует ответ модели: parseQuantity + сопоставление каталога', async () => {
    const client = stubClient({
      pointHint: 'Точка 1',
      sheetType: 'pies',
      dates: ['2026-06-06'],
      rows: [
        {
          productName: 'Пицца открытая',
          cells: [{ date: '2026-06-06', prihod: '24+12+6', ostatok: '4-3', spisanie: null }],
        },
      ],
      unknownLines: [],
      warnings: [],
    });

    const res = await recognizeSheet(
      { image: { kind: 'base64', mediaType: 'image/jpeg', data: 'AAAA' }, catalog, sheetType: 'pies' },
      client,
    );

    expect(res.rows[0].matchedProductId).toBe('p2');
    expect(res.rows[0].cells[0].prihod.value).toBe(42);
    expect(res.rows[0].cells[0].ostatok.value).toBe(1);
  });

  it('бросает, если модель вернула структуру не по схеме', async () => {
    const client = stubClient({ sheetType: 'bread' });
    await expect(
      recognizeSheet(
        { image: { kind: 'base64', mediaType: 'image/jpeg', data: 'AAAA' }, catalog, sheetType: 'pies' },
        client,
      ),
    ).rejects.toThrow();
  });
});

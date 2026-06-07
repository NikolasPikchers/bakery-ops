import { describe, it, expect } from 'vitest';
import { recognizeSheet, type RecognitionClient } from './recognize-sheet';
import type { CatalogEntry } from './match-product';

const catalog: CatalogEntry[] = [{ id: 'p2', name: 'Пицца открытая' }];

// Стаб OpenAI-совместимого клиента: возвращает content (как модель — строкой JSON).
function stubClient(content: unknown): RecognitionClient {
  const text = typeof content === 'string' ? content : JSON.stringify(content);
  return {
    chat: {
      completions: {
        create: async () => ({ choices: [{ message: { content: text } }] }),
      },
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

  it('терпит markdown-ограждения вокруг JSON', async () => {
    const client = stubClient(
      '```json\n{"pointHint":null,"sheetType":"pies","dates":["2026-06-06"],"rows":[],"unknownLines":[],"warnings":[]}\n```',
    );
    const res = await recognizeSheet(
      { image: { kind: 'base64', mediaType: 'image/jpeg', data: 'AAAA' }, catalog, sheetType: 'pies' },
      client,
    );
    expect(res.sheetType).toBe('pies');
    expect(res.rows).toEqual([]);
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

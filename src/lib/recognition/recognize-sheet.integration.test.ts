import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recognizeSheet } from './recognize-sheet';
import type { CatalogEntry } from './match-product';

const FIXTURE = join(__dirname, '__fixtures__', 'pies-sheet.jpg');
const hasKey = !!process.env.OPENROUTER_API_KEY;
const hasFixture = existsSync(FIXTURE);

const catalog: CatalogEntry[] = [
  { id: 'p1', name: 'Самса' },
  { id: 'p2', name: 'Пицца открытая' },
];

describe.skipIf(!hasKey || !hasFixture)('recognizeSheet (реальный API)', () => {
  it('распознаёт реальный лист пирогов', async () => {
    const data = readFileSync(FIXTURE).toString('base64');
    const res = await recognizeSheet({
      image: { kind: 'base64', mediaType: 'image/jpeg', data },
      catalog,
      sheetType: 'pies',
    });
    expect(res.sheetType).toBe('pies');
    expect(res.rows.length).toBeGreaterThan(0);
  }, 60_000);
});

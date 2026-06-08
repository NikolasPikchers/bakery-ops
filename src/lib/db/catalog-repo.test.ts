import { describe, it, expect } from 'vitest';
import { scopeForPoint, loadCatalog, loadCatalogForPoint } from './catalog-repo';

describe('scopeForPoint', () => {
  it('maps seeded point ids to scope keys', () => {
    expect(scopeForPoint('point-1')).toBe('point1');
    expect(scopeForPoint('point-2')).toBe('point2');
  });
  it('throws on unknown point', () => {
    expect(() => scopeForPoint('nope')).toThrow();
  });
});

describe('loadCatalog', () => {
  it('queries active products by sheetType + scope (both | point scope) and maps to CatalogEntry', async () => {
    let received: unknown;
    const fakePrisma = {
      product: {
        findMany: async (args: unknown) => {
          received = args;
          return [
            { id: 'a', name: 'Самса', aliases: [] },
            { id: 'b', name: 'Пирожок с капустой', aliases: ['Пирожок (беккен) с капустой'] },
          ];
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await loadCatalog(fakePrisma as any, 'pies', 'point-1');
    expect(received).toEqual({
      where: { active: true, sheetType: 'pies', pointScope: { in: ['both', 'point1'] } },
      select: { id: true, name: true, aliases: true },
      orderBy: { name: 'asc' },
    });
    expect(out).toEqual([
      { id: 'a', name: 'Самса', aliases: [] },
      { id: 'b', name: 'Пирожок с капустой', aliases: ['Пирожок (беккен) с капустой'] },
    ]);
  });
});

describe('loadCatalogForPoint', () => {
  it('queries active products by scope only (BOTH sheet types) — для смешанных листов', async () => {
    let received: unknown;
    const fakePrisma = {
      product: {
        findMany: async (args: unknown) => {
          received = args;
          return [
            { id: 'a', name: 'Самса', aliases: [] },
            { id: 'c', name: 'Круассан Вишня', aliases: [] },
          ];
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await loadCatalogForPoint(fakePrisma as any, 'point-1');
    expect(received).toEqual({
      where: { active: true, pointScope: { in: ['both', 'point1'] } },
      select: { id: true, name: true, aliases: true },
      orderBy: { name: 'asc' },
    });
    expect(out).toEqual([
      { id: 'a', name: 'Самса', aliases: [] },
      { id: 'c', name: 'Круассан Вишня', aliases: [] },
    ]);
  });
});

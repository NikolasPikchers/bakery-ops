import { describe, it, expect } from 'vitest';
import { SEED_CATALOG, type SeedProduct } from './seed-catalog';

describe('SEED_CATALOG', () => {
  it('не пустой', () => {
    expect(SEED_CATALOG.length).toBeGreaterThan(0);
  });

  it('имя уникально в рамках типа листа', () => {
    const keys = SEED_CATALOG.map((p) => `${p.sheetType}::${p.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('у каждой позиции валидные поля', () => {
    const types = new Set(['pies', 'desserts', 'confectionery_freeform']);
    const scopes = new Set(['both', 'point1', 'point2']);
    for (const p of SEED_CATALOG) {
      expect(p.name.trim().length).toBeGreaterThan(0);
      expect(types.has(p.sheetType)).toBe(true);
      expect(scopes.has(p.pointScope)).toBe(true);
      if (p.shelfLifeDays != null) expect(p.shelfLifeDays).toBeGreaterThan(0);
    }
  });

  it('содержит реальные позиции с листов', () => {
    const names = SEED_CATALOG.map((p) => p.name);
    expect(names).toContain('Самса');
    expect(names).toContain('Пицца открытая');
  });

  it('у пирогов/выпечки нет срока годности (aging — только десерты)', () => {
    const pies = SEED_CATALOG.filter((p) => p.sheetType === 'pies');
    expect(pies.length).toBeGreaterThan(0);
    for (const p of pies) expect(p.shelfLifeDays).toBeUndefined();
  });
});

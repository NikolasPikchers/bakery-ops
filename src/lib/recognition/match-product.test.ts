import { describe, it, expect } from 'vitest';
import { matchProductToCatalog, normalizeName, type CatalogEntry } from './match-product';

const catalog: CatalogEntry[] = [
  { id: 'p1', name: 'Самса' },
  { id: 'p2', name: 'Пицца открытая' },
  { id: 'p3', name: 'Сосиска в тесте', aliases: ['Сосиска в тексе'] },
  { id: 'p4', name: 'Хлеб «Бородинский»' },
];

describe('normalizeName', () => {
  it('убирает кавычки/скобки/ё и схлопывает пробелы', () => {
    expect(normalizeName('Хлеб «Бородинский»')).toBe('хлеб бородинский');
    expect(normalizeName('Пирожок (беккен)  с  капустой')).toBe('пирожок беккен с капустой');
  });
});

describe('matchProductToCatalog', () => {
  it('точное совпадение по имени → confidence 1', () => {
    expect(matchProductToCatalog('Самса', catalog)).toMatchObject({ productId: 'p1', confidence: 1 });
  });
  it('совпадение по алиасу (рукописный вариант) → confidence 1', () => {
    expect(matchProductToCatalog('Сосиска в тексе', catalog)).toMatchObject({ productId: 'p3', confidence: 1 });
  });
  it('перестановка слов → нечёткое совпадение выше порога', () => {
    const m = matchProductToCatalog('Бородинский хлеб', catalog);
    expect(m.productId).toBe('p4');
    expect(m.confidence).toBeGreaterThanOrEqual(0.5);
  });
  it('нет в каталоге → productId null', () => {
    expect(matchProductToCatalog('Шаурма', catalog)).toMatchObject({ productId: null });
  });
});

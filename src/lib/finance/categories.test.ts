import { describe, it, expect } from 'vitest';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_KEYS, categoryLabel, categoryFromInput } from './categories';

describe('expense categories', () => {
  it('exposes the six fixed categories in order', () => {
    expect(EXPENSE_CATEGORY_KEYS).toEqual(['produkty', 'arenda', 'fot', 'kommunalka', 'nalogi', 'prochee']);
    expect(EXPENSE_CATEGORIES.find((c) => c.key === 'fot')?.label).toBe('ФОТ');
  });
  it('categoryLabel maps key to ru label', () => {
    expect(categoryLabel('nalogi')).toBe('Налоги');
    expect(categoryLabel('produkty')).toBe('Продукты');
  });
  it('categoryFromInput resolves by key or ru label (case-insensitive)', () => {
    expect(categoryFromInput('arenda')).toBe('arenda');
    expect(categoryFromInput('Аренда')).toBe('arenda');
    expect(categoryFromInput('  фот ')).toBe('fot');
  });
  it('categoryFromInput returns null for unknown', () => {
    expect(categoryFromInput('зарплата директора')).toBeNull();
  });
});

import { describe, it, expect } from 'vitest';
import { parseFinanceEntry } from './finance-input';

describe('parseFinanceEntry', () => {
  it('parses a revenue entry', () => {
    const r = parseFinanceEntry({ type: 'revenue', pointId: 'point-1', date: '2026-06-05', amount: 18500 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ type: 'revenue', pointId: 'point-1', amount: 18500 });
  });
  it('parses an expense entry with category and note', () => {
    const r = parseFinanceEntry({ type: 'expense', pointId: 'point-2', date: '2026-06-05', amount: 4200, category: 'produkty', note: 'мука' });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.type === 'expense') expect(r.value.category).toBe('produkty');
  });
  it('rejects an unknown point', () => {
    expect(parseFinanceEntry({ type: 'revenue', pointId: 'x', date: '2026-06-05', amount: 1 }).ok).toBe(false);
  });
  it('rejects a non-positive amount', () => {
    expect(parseFinanceEntry({ type: 'revenue', pointId: 'point-1', date: '2026-06-05', amount: 0 }).ok).toBe(false);
  });
  it('rejects a bad date', () => {
    expect(parseFinanceEntry({ type: 'revenue', pointId: 'point-1', date: '05.06.2026', amount: 1 }).ok).toBe(false);
  });
  it('rejects an expense with an unknown category', () => {
    expect(parseFinanceEntry({ type: 'expense', pointId: 'point-1', date: '2026-06-05', amount: 1, category: 'nope' }).ok).toBe(false);
  });
  it('rejects an expense without a category', () => {
    expect(parseFinanceEntry({ type: 'expense', pointId: 'point-1', date: '2026-06-05', amount: 1 }).ok).toBe(false);
  });
});

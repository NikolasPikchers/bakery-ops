import { describe, it, expect } from 'vitest';
import { buildStatementPreview } from './preview';
import type { BankOperation } from './types';

const op = (p: Partial<BankOperation>): BankOperation => ({
  id: Math.random().toString(36).slice(2),
  date: '2026-06-01',
  amount: 0,
  direction: 'out',
  counterparty: null,
  inn: null,
  purpose: null,
  ...p,
});

describe('buildStatementPreview', () => {
  it('делит операции и группирует расходы по категориям', () => {
    const ops: BankOperation[] = [
      op({ amount: 5000, inn: '5258068806', purpose: 'оплата' }), // produkty (СВИТ ЛАЙФ)
      op({ amount: 3000, inn: '524700117689', purpose: 'аренда' }), // arenda (Сулейманов по ИНН)
      op({ amount: 1000, inn: '5258068806' }), // produkty
      op({ amount: 9999, direction: 'in', purpose: 'эквайринг' }), // пополнение — не считаем
      op({ amount: 7000, inn: '524708272990', purpose: 'перевод' }), // перевод себе → исключаем
      op({ amount: 250, purpose: 'непонятный платёж' }), // prochee + needsReview
    ];
    const p = buildStatementPreview(ops);
    expect(p.fetched).toBe(6);
    expect(p.incoming).toBe(1);
    expect(p.excludedTransfers).toBe(1);
    expect(p.outgoing).toBe(4); // 2 produkty + 1 arenda + 1 prochee
    expect(p.sum).toBe(5000 + 3000 + 1000 + 250);
    expect(p.needsReview).toBe(1);
    // по убыванию суммы: produkty 6000, arenda 3000, prochee 250
    expect(p.byCategory.map((b) => b.category)).toEqual(['produkty', 'arenda', 'prochee']);
    expect(p.byCategory[0]).toEqual({ category: 'produkty', count: 2, sum: 6000 });
  });

  it('пустой список', () => {
    expect(buildStatementPreview([])).toEqual({
      fetched: 0, incoming: 0, excludedTransfers: 0, outgoing: 0, sum: 0, needsReview: 0, byCategory: [],
    });
  });
});

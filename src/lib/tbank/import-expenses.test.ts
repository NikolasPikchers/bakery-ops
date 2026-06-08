import { describe, it, expect } from 'vitest';
import { importExpenses } from './import-expenses';
import type { BankOperation } from './types';
import type { ImportedExpense } from '@/lib/db/expense-import-repo';

const op = (over: Partial<BankOperation>): BankOperation => ({
  id: 'x', date: '2026-06-01', amount: 100, direction: 'out',
  counterparty: null, inn: null, purpose: null, ...over,
});

function fakeUpsert() {
  const seen = new Map<string, ImportedExpense>();
  const calls: ImportedExpense[] = [];
  const upsert = async (e: ImportedExpense): Promise<'imported' | 'updated'> => {
    calls.push(e);
    const had = seen.has(e.externalId);
    seen.set(e.externalId, e);
    return had ? 'updated' : 'imported';
  };
  return { upsert, calls };
}

describe('importExpenses', () => {
  const ops: BankOperation[] = [
    op({ id: 'op1', direction: 'out', purpose: 'Аренда за июнь', amount: 1500 }),
    op({ id: 'op2', direction: 'in', purpose: 'Выручка', amount: 5000 }),
    op({ id: 'op3', direction: 'out', purpose: 'Электроэнергия', amount: 300 }),
    op({ id: 'op4', direction: 'out', inn: '524708272990', purpose: 'Перевод собственных средств на счет', amount: 100000 }),
  ];

  it('фильтрует исходящие и вывод средств себе, категоризирует и считает сводку', async () => {
    const { upsert, calls } = fakeUpsert();
    const summary = await importExpenses({
      fetchStatement: async () => ops, upsert, pointId: 'point-1', from: '', till: '',
    });
    expect(summary).toEqual({ fetched: 4, outgoing: 2, imported: 2, updated: 0 });
    expect(calls.map((c) => c.externalId)).toEqual(['op1', 'op3']);
    expect(calls[0]).toMatchObject({ pointId: 'point-1', category: 'arenda', amount: 1500, note: 'Аренда за июнь' });
    expect(calls[1]).toMatchObject({ category: 'kommunalka' });
  });

  it('идемпотентен: повторный прогон только обновляет', async () => {
    const { upsert } = fakeUpsert();
    const args = { fetchStatement: async () => ops, upsert, pointId: 'point-1', from: '', till: '' };
    await importExpenses(args);
    const second = await importExpenses(args);
    expect(second).toEqual({ fetched: 4, outgoing: 2, imported: 0, updated: 2 });
  });
});

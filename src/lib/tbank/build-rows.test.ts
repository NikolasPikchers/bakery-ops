import { describe, it, expect } from 'vitest';
import { buildExpenseRows } from './build-rows';
import type { BankOperation } from './types';

const op = (p: Partial<BankOperation>): BankOperation => ({
  id: 'x', date: '2026-06-01', amount: 0, direction: 'out', counterparty: null, inn: null, purpose: null, ...p,
});

describe('buildExpenseRows', () => {
  it('фильтрует, категоризирует, дедуплицирует по externalId', () => {
    const rows = buildExpenseRows(
      [
        op({ id: 'a', amount: 5000, inn: '5258068806' }), // produkty
        op({ id: 'a', amount: 5000, inn: '5258068806' }), // дубль того же id → 1 строка
        op({ id: 'b', amount: 3000, inn: '524700117689' }), // arenda
        op({ id: 'c', amount: 9000, direction: 'in' }), // пополнение → не расход
        op({ id: 'd', amount: 7000, inn: '524708272990' }), // перевод себе → исключаем
        op({ id: 'e', amount: 100, date: '' }), // без даты → пропускаем
      ],
      'point-1',
    );
    expect(rows.map((r) => r.externalId).sort()).toEqual(['a', 'b']);
    expect(rows.find((r) => r.externalId === 'a')!.category).toBe('produkty');
    expect(rows.find((r) => r.externalId === 'b')!.category).toBe('arenda');
    expect(rows.every((r) => r.pointId === 'point-1')).toBe(true);
  });

  it('пустой ввод → пусто', () => {
    expect(buildExpenseRows([], 'point-1')).toEqual([]);
  });
});

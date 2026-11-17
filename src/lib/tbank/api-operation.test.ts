import { describe, expect, it } from 'vitest';
import { toBankOperation } from './api-operation';
import { categorize, isImportableExpense } from './categorize';

const ACC = '40802810000000002271';

describe('toBankOperation — операция T-API в формате выписки', () => {
  it('списание по карте: ключ по номеру платежа и дате по Москве, назначение из payPurpose', () => {
    const op = toBankOperation(
      {
        operationId: 'uuid-1',
        documentNumber: '24108',
        operationDate: '2026-10-31T21:30:00Z', // уже 1 ноября по Москве
        typeOfOperation: 'Debit',
        accountAmount: 406.7,
        operationAmount: 406.7,
        payPurpose: 'Отражение операции оплаты по карте 1234',
        description: 'Оплата в МАГАЗИН',
        counterParty: { name: 'МАГАЗИН', inn: '' },
      },
      ACC,
    );
    expect(op).toEqual({
      id: `${ACC}|24108|2026-11-01|406.70`,
      date: '2026-11-01',
      amount: 406.7,
      direction: 'out',
      counterparty: 'МАГАЗИН',
      inn: null,
      purpose: 'Отражение операции оплаты по карте 1234',
    });
    expect(categorize(op).category).toBe('produkty');
  });

  it('поступление — direction in, в расходы не попадает', () => {
    const op = toBankOperation({ documentNumber: '1', operationDate: '2026-11-02', typeOfOperation: 'Credit', accountAmount: 5000 }, ACC);
    expect(op.direction).toBe('in');
    expect(isImportableExpense(op)).toBe(false);
  });

  it('без payPurpose — назначение из description', () => {
    expect(toBankOperation({ documentNumber: '2', operationDate: '2026-11-02', typeOfOperation: 'Debit', accountAmount: 1, description: 'Комиссия' }, ACC).purpose).toBe('Комиссия');
  });

  it('нет номера платежа — ключ по operationId, чтобы не склеить разные операции', () => {
    expect(toBankOperation({ operationId: 'u-9', operationDate: '2026-11-02', typeOfOperation: 'Debit', accountAmount: 1 }, ACC).id).toBe(`${ACC}|u-9|2026-11-02|1.00`);
  });

  it('перевод себе (selfIncomeOuter) — не расход, даже если ИНН не наш', () => {
    const op = toBankOperation(
      { documentNumber: '3', operationDate: '2026-11-02', typeOfOperation: 'Debit', accountAmount: 100000, category: 'selfIncomeOuter', payPurpose: 'Перевод', counterParty: { name: 'Иванов', inn: '000' } },
      ACC,
    );
    expect(isImportableExpense(op)).toBe(false);
  });
});

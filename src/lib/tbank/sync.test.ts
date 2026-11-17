import { describe, expect, it } from 'vitest';
import { syncTbankExpenses, tbankSyncWindow, tbankTokenFromEnv } from './sync';
import type { TbankRawOperation } from './client';
import type { ImportedExpense } from '@/lib/db/expense-import-repo';

const ACC = '40802810000000002271';

function fakeBank(ops: TbankRawOperation[], accounts = [{ accountNumber: ACC, accountType: 'Current', currency: '643' }]) {
  const statementCalls: [string, string, string][] = [];
  return {
    statementCalls,
    client: {
      getAccounts: async () => accounts,
      getStatement: async (acc: string, from: string, till: string) => {
        statementCalls.push([acc, from, till]);
        return ops;
      },
    },
  };
}

function memoryStore(initial: string[] = []) {
  const rows = new Map<string, ImportedExpense>(initial.map((id) => [id, { externalId: id } as ImportedExpense]));
  return {
    rows,
    existingIds: async () => [...rows.keys()],
    upsert: async (r: ImportedExpense) => {
      const had = rows.has(r.externalId);
      rows.set(r.externalId, r);
      return had ? ('updated' as const) : ('imported' as const);
    },
  };
}

const card = (doc: string, date: string, amount: number): TbankRawOperation => ({
  documentNumber: doc,
  operationDate: `${date}T12:00:00+03:00`,
  typeOfOperation: 'Debit',
  accountAmount: amount,
  payPurpose: 'Отражение операции оплаты по карте',
  counterParty: { name: 'Магазин', inn: '' },
});

describe('tbankSyncWindow', () => {
  it('последние 7 дней по Москве — банк проводит часть операций с опозданием', () => {
    expect(tbankSyncWindow(new Date('2026-11-18T01:00:00Z'))).toEqual({ from: '2026-11-12', till: '2026-11-18' });
    expect(tbankSyncWindow(new Date('2026-11-17T22:30:00Z'))).toEqual({ from: '2026-11-12', till: '2026-11-18' });
  });
});

describe('tbankTokenFromEnv', () => {
  it('без токена — понятная ошибка', () => {
    expect(() => tbankTokenFromEnv({})).toThrow(/TBUSINESS_API_TOKEN/);
    expect(tbankTokenFromEnv({ TBUSINESS_API_TOKEN: 't.x' })).toBe('t.x');
  });
});

describe('syncTbankExpenses', () => {
  it('новые списания — в расходы Плюшкино с категорией; поступления и переводы себе — нет', async () => {
    const bank = fakeBank([
      card('1', '2026-11-16', 406.7),
      { documentNumber: '2', operationDate: '2026-11-16', typeOfOperation: 'Credit', accountAmount: 5000 },
      { documentNumber: '3', operationDate: '2026-11-16', typeOfOperation: 'Debit', accountAmount: 90000, category: 'selfIncomeOuter' },
    ]);
    const store = memoryStore();
    const s = await syncTbankExpenses({ client: bank.client, ...store, from: '2026-11-12', till: '2026-11-18' });
    expect(s).toMatchObject({ accounts: 1, fetched: 3, outgoing: 1, imported: 1, updated: 0, dryRun: false });
    expect([...store.rows.values()][0]).toMatchObject({ externalId: `${ACC}|1|2026-11-16|406.70`, pointId: 'point-1', category: 'produkty', amount: 406.7 });
  });

  it('операция, уже загруженная из файла, обновляется под своим старым externalId — без дубля', async () => {
    const store = memoryStore([`${ACC}|24108|31.10.2026|406,7`]);
    const s = await syncTbankExpenses({ client: fakeBank([card('24108', '2026-10-31', 406.7)]).client, ...store, from: '2026-10-25', till: '2026-10-31' });
    expect(s).toMatchObject({ imported: 0, updated: 1 });
    expect([...store.rows.keys()]).toEqual([`${ACC}|24108|31.10.2026|406,7`]);
  });

  it('повторный прогон ничего не дублирует', async () => {
    const bank = fakeBank([card('1', '2026-11-16', 10)]);
    const store = memoryStore();
    await syncTbankExpenses({ client: bank.client, ...store, from: '2026-11-12', till: '2026-11-18' });
    const again = await syncTbankExpenses({ client: bank.client, ...store, from: '2026-11-12', till: '2026-11-18' });
    expect(again).toMatchObject({ imported: 0, updated: 1 });
    expect(store.rows.size).toBe(1);
  });

  it('пробный прогон считает, но ничего не пишет', async () => {
    const store = memoryStore([`${ACC}|24108|31.10.2026|406,7`]);
    const s = await syncTbankExpenses({
      client: fakeBank([card('24108', '2026-10-31', 406.7), card('5', '2026-10-31', 1)]).client,
      ...store,
      from: '2026-10-25',
      till: '2026-10-31',
      dryRun: true,
    });
    expect(s).toMatchObject({ dryRun: true, imported: 1, updated: 1 });
    expect(store.rows.size).toBe(1);
  });

  it('берёт только рублёвые расчётные счета', async () => {
    const bank = fakeBank([], [
      { accountNumber: ACC, accountType: 'Current', currency: '643' },
      { accountNumber: '40802840000000000001', accountType: 'Current', currency: '840' },
      { accountNumber: '40802810000000000099', accountType: 'Tax', currency: '643' },
    ]);
    const s = await syncTbankExpenses({ client: bank.client, ...memoryStore(), from: '2026-11-12', till: '2026-11-18' });
    expect(s.accounts).toBe(1);
    expect(bank.statementCalls.map((c) => c[0])).toEqual([ACC]);
  });
});

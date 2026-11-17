import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import { bulkInsertExpenses, type ImportedExpense } from './expense-import-repo';

const ACC = '40802810000000002271';
const row = (externalId: string, date = '2026-11-16'): ImportedExpense => ({
  externalId,
  pointId: 'point-1',
  date,
  amount: 406.7,
  category: 'produkty',
  counterparty: null,
  inn: null,
  note: null,
});

function fakePrisma(existing: string[]) {
  const createMany = vi.fn(async () => ({ count: 0 }));
  const prisma = {
    expense: {
      findMany: vi.fn(async () => existing.map((externalId) => ({ externalId }))),
      createMany,
    },
  } as unknown as PrismaClient;
  return { prisma, createMany };
}

describe('bulkInsertExpenses (загрузка файла-выписки)', () => {
  it('операцию, уже подтянутую из банка по API, не дублирует', async () => {
    const { prisma, createMany } = fakePrisma([`${ACC}|24108|2026-11-16|406.70`]);
    const res = await bulkInsertExpenses(prisma, [row(`${ACC}|24108|16.11.2026|406,7`)]);
    expect(res).toEqual({ imported: 0, skipped: 1 });
    expect(createMany).not.toHaveBeenCalled();
  });

  it('новую — вставляет', async () => {
    const { prisma, createMany } = fakePrisma([]);
    const res = await bulkInsertExpenses(prisma, [row(`${ACC}|1|16.11.2026|406,7`)]);
    expect(res).toEqual({ imported: 1, skipped: 0 });
    expect(createMany).toHaveBeenCalledOnce();
  });
});

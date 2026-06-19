import type { PrismaClient } from '@prisma/client';
import { toDbDate } from './dates';

export type ImportedExpense = {
  externalId: string;
  pointId: string;
  date: string; // ISO yyyy-mm-dd
  amount: number;
  category: string; // ключ ExpenseCategory
  counterparty: string | null;
  inn: string | null;
  note: string | null; // назначение платежа
};

/** Идемпотентно создаёт/обновляет расход по externalId. Возвращает что произошло. */
export async function upsertImportedExpense(
  prisma: PrismaClient,
  e: ImportedExpense,
): Promise<'imported' | 'updated'> {
  const existing = await prisma.expense.findUnique({ where: { externalId: e.externalId }, select: { id: true } });
  await prisma.expense.upsert({
    where: { externalId: e.externalId },
    create: {
      externalId: e.externalId,
      pointId: e.pointId,
      date: toDbDate(e.date),
      amount: e.amount,
      category: e.category as never,
      source: 'tbusiness' as never,
      counterparty: e.counterparty ?? undefined,
      inn: e.inn ?? undefined,
      note: e.note ?? undefined,
    },
    // При повторной загрузке выписки НЕ трогаем category: сохраняем ручные правки
    // категорий, сделанные во вкладке «Расходы». Обновляем только факты из банка.
    update: {
      amount: e.amount,
      counterparty: e.counterparty ?? undefined,
      inn: e.inn ?? undefined,
      note: e.note ?? undefined,
    },
  });
  return existing ? 'updated' : 'imported';
}

/**
 * Пакетный импорт выписки: один SELECT существующих externalId + один createMany
 * новых (skipDuplicates). Идемпотентно, не зависит от размера выписки — не упирается
 * в лимит времени функции (в отличие от построчного upsert). Существующие строки не
 * трогаем (ручные правки категорий сохраняются).
 */
export async function bulkInsertExpenses(
  prisma: PrismaClient,
  rows: ImportedExpense[],
): Promise<{ imported: number; skipped: number }> {
  if (rows.length === 0) return { imported: 0, skipped: 0 };
  const ids = rows.map((r) => r.externalId);
  const existing = await prisma.expense.findMany({ where: { externalId: { in: ids } }, select: { externalId: true } });
  const have = new Set(existing.map((e) => e.externalId));
  const toCreate = rows.filter((r) => !have.has(r.externalId));
  if (toCreate.length > 0) {
    await prisma.expense.createMany({
      data: toCreate.map((r) => ({
        externalId: r.externalId,
        pointId: r.pointId,
        date: toDbDate(r.date),
        amount: r.amount,
        category: r.category as never,
        source: 'tbusiness' as never,
        counterparty: r.counterparty ?? undefined,
        inn: r.inn ?? undefined,
        note: r.note ?? undefined,
      })),
      skipDuplicates: true,
    });
  }
  return { imported: toCreate.length, skipped: rows.length - toCreate.length };
}

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

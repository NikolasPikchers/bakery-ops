import { categorize, isImportableExpense } from './categorize';
import type { BankOperation } from './types';
import type { ImportedExpense } from '@/lib/db/expense-import-repo';

/**
 * Готовит строки расходов к пакетной вставке: оставляет только импортируемые
 * операции с распознанной датой, категоризирует, дедуплицирует по externalId
 * внутри файла. Чистая функция — без БД.
 */
export function buildExpenseRows(ops: BankOperation[], pointId: string): ImportedExpense[] {
  const byId = new Map<string, ImportedExpense>();
  for (const o of ops) {
    if (!o.date || !isImportableExpense(o)) continue;
    byId.set(o.id, {
      externalId: o.id,
      pointId,
      date: o.date,
      amount: o.amount,
      category: categorize(o).category,
      counterparty: o.counterparty,
      inn: o.inn,
      note: o.purpose,
    });
  }
  return [...byId.values()];
}

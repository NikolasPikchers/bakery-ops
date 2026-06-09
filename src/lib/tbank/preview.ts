import { categorize, isImportableExpense } from './categorize';
import type { BankOperation } from './types';
import type { ExpenseCategoryKey } from '@/lib/finance/categories';

export type CategoryBucket = { category: ExpenseCategoryKey; count: number; sum: number };

export type StatementPreview = {
  fetched: number; // всего строк-операций
  incoming: number; // пополнения (не импортируем)
  excludedTransfers: number; // исходящие, но переводы себе → не расход
  outgoing: number; // исходящие бизнес-расходы (к импорту)
  sum: number; // сумма бизнес-расходов, ₽
  needsReview: number; // попали в «прочее» без правила (стоит проверить руками)
  byCategory: CategoryBucket[]; // по убыванию суммы
};

/** Чистая сводка по операциям выписки — для предпросмотра результата импорта. */
export function buildStatementPreview(ops: BankOperation[]): StatementPreview {
  let incoming = 0;
  let excludedTransfers = 0;
  let outgoing = 0;
  let sum = 0;
  let needsReview = 0;
  const byCat = new Map<ExpenseCategoryKey, { count: number; sum: number }>();

  for (const o of ops) {
    if (o.direction === 'in') {
      incoming++;
      continue;
    }
    if (!isImportableExpense(o)) {
      excludedTransfers++;
      continue;
    }
    outgoing++;
    sum += o.amount;
    const { category, needsReview: nr } = categorize(o);
    if (nr) needsReview++;
    const c = byCat.get(category) ?? { count: 0, sum: 0 };
    c.count++;
    c.sum += o.amount;
    byCat.set(category, c);
  }

  const byCategory = [...byCat.entries()]
    .map(([category, v]) => ({ category, count: v.count, sum: v.sum }))
    .sort((a, b) => b.sum - a.sum);

  return { fetched: ops.length, incoming, excludedTransfers, outgoing, sum, needsReview, byCategory };
}

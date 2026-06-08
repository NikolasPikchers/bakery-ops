import { categorize, isImportableExpense } from './categorize';
import type { BankOperation, ImportSummary } from './types';
import type { ImportedExpense } from '@/lib/db/expense-import-repo';

export type ImportDeps = {
  fetchStatement: (from: string, till: string) => Promise<BankOperation[]>;
  upsert: (e: ImportedExpense) => Promise<'imported' | 'updated'>;
  pointId: string;
  from: string;
  till: string;
};

export async function importExpenses(deps: ImportDeps): Promise<ImportSummary> {
  const ops = await deps.fetchStatement(deps.from, deps.till);
  let outgoing = 0;
  let imported = 0;
  let updated = 0;
  for (const o of ops) {
    if (!isImportableExpense(o)) continue;
    outgoing++;
    const { category } = categorize(o);
    const res = await deps.upsert({
      externalId: o.id,
      pointId: deps.pointId,
      date: o.date,
      amount: o.amount,
      category,
      counterparty: o.counterparty,
      inn: o.inn,
      note: o.purpose,
    });
    if (res === 'imported') imported++;
    else updated++;
  }
  return { fetched: ops.length, outgoing, imported, updated };
}

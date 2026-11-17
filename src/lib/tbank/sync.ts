import type { PrismaClient } from '@prisma/client';
import { toDbDate } from '../db/dates';
import { upsertImportedExpense, type ImportedExpense } from '../db/expense-import-repo';
import { todayMoscow } from '../staff/dates';
import { toBankOperation } from './api-operation';
import { buildExpenseRows } from './build-rows';
import { TBusinessClient } from './client';
import { reconcileExternalIds } from './expense-key';

/** v1: счёт общий, все расходы вешаем на Плюшкино — как и при загрузке файла. */
const POINT = 'point-1';
/** Окно синхронизации: банк проводит часть операций (карты, комиссии) на день-два позже. */
const SYNC_DAYS = 7;
const DAY_MS = 86_400_000;

export function tbankTokenFromEnv(env: Record<string, string | undefined> = process.env): string {
  const token = env.TBUSINESS_API_TOKEN;
  if (!token) throw new Error('Нет TBUSINESS_API_TOKEN — токена T-API');
  return token;
}

const shift = (iso: string, days: number) => new Date(Date.parse(`${iso}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);

/** Последние 7 дней по Москве, включая сегодня. */
export function tbankSyncWindow(now: Date): { from: string; till: string } {
  const till = todayMoscow(now);
  return { from: shift(till, -(SYNC_DAYS - 1)), till };
}

export type TbankSyncSummary = {
  from: string;
  till: string;
  accounts: number;
  fetched: number; // операций из банка
  outgoing: number; // из них — расходы
  imported: number; // новых
  updated: number; // уже были (из файла или прошлых синхронизаций)
  dryRun: boolean;
};

type BankSource = Pick<TBusinessClient, 'getAccounts' | 'getStatement'>;

export async function syncTbankExpenses(deps: {
  client: BankSource;
  existingIds: (from: string, till: string) => Promise<string[]>;
  upsert: (row: ImportedExpense) => Promise<'imported' | 'updated'>;
  from: string;
  till: string;
  dryRun?: boolean;
}): Promise<TbankSyncSummary> {
  const accounts = (await deps.client.getAccounts()).filter(
    (a) => (a.accountType ?? 'Current') === 'Current' && ['643', 'RUB', undefined, null].includes(a.currency ?? undefined),
  );
  let fetched = 0;
  const rows: ImportedExpense[] = [];
  for (const a of accounts) {
    const raw = await deps.client.getStatement(a.accountNumber, deps.from, deps.till);
    fetched += raw.length;
    rows.push(...buildExpenseRows(raw.map((r) => toBankOperation(r, a.accountNumber)), POINT));
  }

  // Существующие строки берём с запасом по датам: дата операции из файла и из API совпадают, но границы окна — нет.
  const existing = await deps.existingIds(shift(deps.from, -3), shift(deps.till, 3));
  const reconciled = reconcileExternalIds(rows, existing).rows;
  const have = new Set(existing);

  let imported = 0;
  let updated = 0;
  for (const row of reconciled) {
    if (deps.dryRun) {
      if (have.has(row.externalId)) updated++;
      else imported++;
      continue;
    }
    if ((await deps.upsert(row)) === 'imported') imported++;
    else updated++;
  }
  return { from: deps.from, till: deps.till, accounts: accounts.length, fetched, outgoing: reconciled.length, imported, updated, dryRun: !!deps.dryRun };
}

/** Боевая сборка: T-API из окружения + запись в Expense (source tbusiness). */
export function runTbankSync(prisma: PrismaClient, range: { from: string; till: string }, opts: { dryRun?: boolean } = {}): Promise<TbankSyncSummary> {
  return syncTbankExpenses({
    client: new TBusinessClient({ token: tbankTokenFromEnv() }),
    existingIds: async (from, till) =>
      (
        await prisma.expense.findMany({
          where: { source: 'tbusiness', date: { gte: toDbDate(from), lte: toDbDate(till) } },
          select: { externalId: true },
        })
      ).flatMap((e) => (e.externalId ? [e.externalId] : [])),
    upsert: (row) => upsertImportedExpense(prisma, row),
    ...range,
    dryRun: opts.dryRun,
  });
}

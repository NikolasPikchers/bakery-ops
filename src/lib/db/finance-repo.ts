import type { PrismaClient } from '@prisma/client';
import { toDbDate } from './dates';

type RevenueSrc = 'manual' | 'import' | 'iiko';
type ExpenseSrc = 'manual' | 'import';

export type RevenueInput = { pointId: string; date: string; amount: number; source: RevenueSrc; confectionery?: number | null; note?: string | null; createdBy?: string | null };
export type ExpenseInput = { pointId: string; date: string; amount: number; category: string; source: ExpenseSrc; note?: string | null; createdBy?: string | null };

export async function upsertRevenue(prisma: PrismaClient, r: RevenueInput) {
  const date = toDbDate(r.date);
  return prisma.revenue.upsert({
    where: { pointId_date: { pointId: r.pointId, date } },
    create: { pointId: r.pointId, date, amount: r.amount, confectionery: r.confectionery ?? undefined, source: r.source, note: r.note ?? undefined, createdBy: r.createdBy ?? undefined },
    update: { amount: r.amount, confectionery: r.confectionery ?? undefined, source: r.source, note: r.note ?? undefined },
  });
}

export async function createExpense(prisma: PrismaClient, e: ExpenseInput) {
  return prisma.expense.create({
    data: {
      pointId: e.pointId,
      date: toDbDate(e.date),
      amount: e.amount,
      // category — строковый ключ enum ExpenseCategory; приводим к типу enum-инпута Prisma.
      category: e.category as never,
      source: e.source,
      note: e.note ?? undefined,
      createdBy: e.createdBy ?? undefined,
    },
  });
}

export type FinanceEntryView = {
  id: string;
  type: 'revenue' | 'expense';
  date: string; // ISO yyyy-mm-dd
  pointName: string;
  amount: number;
  category: string | null;
  source: string;
};

export async function listFinanceEntries(prisma: PrismaClient, limit = 50): Promise<FinanceEntryView[]> {
  const [rev, exp] = await Promise.all([
    prisma.revenue.findMany({ orderBy: { date: 'desc' }, take: limit, include: { point: { select: { name: true } } } }),
    prisma.expense.findMany({ orderBy: { date: 'desc' }, take: limit, include: { point: { select: { name: true } } } }),
  ]);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const items: FinanceEntryView[] = [
    ...rev.map((r) => ({ id: r.id, type: 'revenue' as const, date: iso(r.date), pointName: r.point.name, amount: Number(r.amount), category: null, source: r.source })),
    ...exp.map((e) => ({ id: e.id, type: 'expense' as const, date: iso(e.date), pointName: e.point.name, amount: Number(e.amount), category: e.category, source: e.source })),
  ];
  // date — ISO yyyy-mm-dd, поэтому лексикографическая сортировка = хронологическая (по убыванию).
  items.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  return items.slice(0, limit);
}

export async function deleteRevenue(prisma: PrismaClient, id: string) {
  await prisma.revenue.delete({ where: { id } });
}
export async function deleteExpense(prisma: PrismaClient, id: string) {
  await prisma.expense.delete({ where: { id } });
}

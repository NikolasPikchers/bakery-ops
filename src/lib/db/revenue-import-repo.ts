import type { PrismaClient } from '@prisma/client';
import { toDbDate } from './dates';
import { upsertRevenue } from './finance-repo';

/** Идемпотентно создаёт/обновляет дневную выручку. Возвращает что произошло. */
export async function upsertImportedRevenue(
  prisma: PrismaClient,
  e: { pointId: string; date: string; amount: number; source?: 'iiko' | 'manual' | 'import'; confectionery?: number | null },
): Promise<'imported' | 'updated'> {
  const existing = await prisma.revenue.findUnique({
    where: { pointId_date: { pointId: e.pointId, date: toDbDate(e.date) } },
    select: { id: true },
  });
  await upsertRevenue(prisma, { pointId: e.pointId, date: e.date, amount: e.amount, source: e.source ?? 'iiko', confectionery: e.confectionery ?? null });
  return existing ? 'updated' : 'imported';
}

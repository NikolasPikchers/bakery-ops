import type { PrismaClient } from '@prisma/client';
import type { DishSaleDay } from '../iiko/types';
import { toDbDate } from './dates';

const iso = (d: Date) => d.toISOString().slice(0, 10);

/**
 * Продажи по позициям за [from; till] заменяются целиком: блюдо может исчезнуть из дня,
 * если заказ удалили задним числом, — upsert оставил бы его висеть. Возвращает число строк.
 */
export async function replaceDishSales(prisma: PrismaClient, pointId: string, from: string, till: string, rows: DishSaleDay[]): Promise<number> {
  return prisma.$transaction(
    async (tx) => {
      await tx.dishSale.deleteMany({ where: { pointId, date: { gte: toDbDate(from), lte: toDbDate(till) } } });
      let count = 0;
      // Пачками: у Postgres лимит 65535 параметров на запрос, а месяц истории — ~2 тыс. строк × 10 полей.
      for (let i = 0; i < rows.length; i += INSERT_BATCH) {
        count += (await tx.dishSale.createMany({ data: rows.slice(i, i + INSERT_BATCH).map((r) => toRow(pointId, r)) })).count;
      }
      return count;
    },
    { timeout: 60_000 },
  );
}

const INSERT_BATCH = 1000;

function toRow(pointId: string, r: DishSaleDay) {
  return {
    pointId,
    date: toDbDate(r.date),
    dishId: r.dishId,
    name: r.name,
    dishGroup: r.dishGroup,
    qty: r.qty,
    revenue: r.revenue,
    cost: r.cost,
    checks: r.checks,
    soloChecks: r.soloChecks,
  };
}

/** Продажи по позициям за [from; till], по дате. */
export async function loadDishSales(prisma: PrismaClient, pointId: string, from: string, till: string): Promise<DishSaleDay[]> {
  const rows = await prisma.dishSale.findMany({
    where: { pointId, date: { gte: toDbDate(from), lte: toDbDate(till) } },
    select: { date: true, dishId: true, name: true, dishGroup: true, qty: true, revenue: true, cost: true, checks: true, soloChecks: true },
    orderBy: { date: 'asc' },
  });
  return rows.map((r) => ({
    ...r,
    date: iso(r.date),
    qty: Number(r.qty),
    revenue: Number(r.revenue),
    cost: Number(r.cost),
  }));
}

/** Первая и последняя продажа каждой позиции за всю историю — для «новинки» и «уже не продаётся». */
export async function loadDishSpans(prisma: PrismaClient, pointId: string): Promise<Map<string, { first: string; last: string }>> {
  const rows = await prisma.dishSale.groupBy({ by: ['dishId'], where: { pointId }, _min: { date: true }, _max: { date: true } });
  return new Map(rows.filter((r) => r._min.date && r._max.date).map((r) => [r.dishId, { first: iso(r._min.date!), last: iso(r._max.date!) }]));
}

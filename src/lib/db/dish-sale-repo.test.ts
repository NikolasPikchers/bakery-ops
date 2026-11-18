import { describe, expect, it, vi } from 'vitest';
import type { PrismaClient } from '@prisma/client';
import type { DishSaleDay } from '../iiko/types';
import { loadDishSpans, replaceDishSales } from './dish-sale-repo';

const sale = (date: string, dishId: string): DishSaleDay => ({
  date, dishId, name: dishId, dishGroup: null, qty: 1, revenue: 100, cost: 0, checks: 1, soloChecks: 0,
});

function fakePrisma() {
  const deleteMany = vi.fn(async () => ({ count: 3 }));
  const createMany = vi.fn(async ({ data }: { data: unknown[] }) => ({ count: data.length }));
  const groupBy = vi.fn(async () => [
    { dishId: 'pizza', _min: { date: new Date('2026-01-03T00:00:00Z') }, _max: { date: new Date('2026-11-17T00:00:00Z') } },
  ]);
  const tx = { dishSale: { deleteMany, createMany } };
  const prisma = {
    dishSale: { groupBy },
    $transaction: vi.fn(async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx)),
  } as unknown as PrismaClient;
  return { prisma, deleteMany, createMany };
}

describe('replaceDishSales — день заменяется целиком', () => {
  it('удаляет строки дней периода и пишет новые: блюдо, пропавшее из дня (заказ удалён), исчезает', async () => {
    const { prisma, deleteMany, createMany } = fakePrisma();
    const n = await replaceDishSales(prisma, 'point-1', '2026-11-16', '2026-11-17', [sale('2026-11-16', 'pizza'), sale('2026-11-17', 'tea')]);
    expect(n).toBe(2);
    expect(deleteMany).toHaveBeenCalledWith({
      where: { pointId: 'point-1', date: { gte: new Date('2026-11-16T00:00:00.000Z'), lte: new Date('2026-11-17T00:00:00.000Z') } },
    });
    const data = (createMany.mock.calls[0][0] as { data: Record<string, unknown>[] }).data;
    expect(data[0]).toMatchObject({ pointId: 'point-1', dishId: 'pizza', date: new Date('2026-11-16T00:00:00.000Z'), revenue: 100 });
  });

  it('пустой период (точка закрыта) — только удаление', async () => {
    const { prisma, deleteMany, createMany } = fakePrisma();
    expect(await replaceDishSales(prisma, 'point-1', '2026-11-16', '2026-11-16', [])).toBe(0);
    expect(deleteMany).toHaveBeenCalledOnce();
    expect(createMany).not.toHaveBeenCalled();
  });
});

describe('loadDishSpans', () => {
  it('первая и последняя продажа каждой позиции за всю историю', async () => {
    const { prisma } = fakePrisma();
    expect(await loadDishSpans(prisma, 'point-1')).toEqual(new Map([['pizza', { first: '2026-01-03', last: '2026-11-17' }]]));
  });
});

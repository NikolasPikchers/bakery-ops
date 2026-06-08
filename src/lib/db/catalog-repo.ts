import type { PrismaClient } from '@prisma/client';
import type { SheetType } from '@/lib/domain/types';
import type { CatalogEntry } from '@/lib/recognition/match-product';

type CatalogClient = Pick<PrismaClient, 'product'>;
type ScopeKey = 'point1' | 'point2';

/** Сид задаёт точкам детерминированные id point-1 / point-2 (prisma/seed.ts). */
export function scopeForPoint(pointId: string): ScopeKey {
  if (pointId === 'point-1') return 'point1';
  if (pointId === 'point-2') return 'point2';
  throw new Error(`Unknown point id: ${pointId}`);
}

/** Каталог для (тип листа, точка): активные SKU нужного типа, чья область — both или точка. */
export async function loadCatalog(
  prisma: CatalogClient,
  sheetType: SheetType,
  pointId: string,
): Promise<CatalogEntry[]> {
  const scope = scopeForPoint(pointId);
  const rows = await prisma.product.findMany({
    where: { active: true, sheetType, pointScope: { in: ['both', scope] } },
    select: { id: true, name: true, aliases: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, aliases: r.aliases }));
}

/**
 * Полный каталог точки (ОБА типа — пироги и десерты). Для распознавания «смешанных» листов
 * (одна бумага Плюшкино = печатные пироги + от руки кондитерка/десерты): кандидатами должны быть
 * все SKU точки, а не только sheetType листа.
 */
export async function loadCatalogForPoint(
  prisma: CatalogClient,
  pointId: string,
): Promise<CatalogEntry[]> {
  const scope = scopeForPoint(pointId);
  const rows = await prisma.product.findMany({
    where: { active: true, pointScope: { in: ['both', scope] } },
    select: { id: true, name: true, aliases: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, aliases: r.aliases }));
}

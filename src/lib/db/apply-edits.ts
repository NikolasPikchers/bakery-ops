import type { PrismaClient } from '@prisma/client';
import { computeSold } from '@/lib/domain/computeSold';
import { toDbDate } from './dates';
import { getPreviousOstatok } from './movements-repo';
import type { MovementEdit } from '@/lib/http/sheet-actions';

export type EditedMovement = MovementEdit & {
  pointId: string;
  soldCalc: number | null;
  manuallyEdited: true;
};

type GetPrev = (pointId: string, productId: string, beforeDate: string) => Promise<number | null>;

/**
 * Чистый расчёт: по правкам считает soldCalc, цепляя остаток внутри партии правок по дате,
 * а для самой ранней даты товара берёт предыдущий остаток из БД (getPrev).
 */
export async function computeEditedMovements(
  pointId: string,
  edits: MovementEdit[],
  getPrev: GetPrev,
): Promise<EditedMovement[]> {
  const byProduct = new Map<string, MovementEdit[]>();
  for (const e of edits) {
    const list = byProduct.get(e.productId) ?? [];
    list.push(e);
    byProduct.set(e.productId, list);
  }

  const out: EditedMovement[] = [];
  for (const [productId, list] of byProduct) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    let prevOstatok: number | null = await getPrev(pointId, productId, sorted[0].date);
    for (const e of sorted) {
      const { sold } = computeSold({
        prevOstatok,
        prihod: e.prihod,
        spisanie: e.spisanie,
        ostatok: e.ostatok,
      });
      out.push({ ...e, pointId, soldCalc: sold, manuallyEdited: true });
      prevOstatok = e.ostatok;
    }
  }
  return out;
}

/** Запись правок в БД (manuallyEdited=true) + пересчёт soldCalc. */
export async function applyMovementEdits(
  prisma: PrismaClient,
  pointId: string,
  sheetId: string,
  edits: MovementEdit[],
): Promise<void> {
  const computed = await computeEditedMovements(pointId, edits, (pid, prod, before) =>
    getPreviousOstatok(prisma, pid, prod, before),
  );
  await prisma.$transaction(
    computed.map((m) => {
      const date = toDbDate(m.date);
      return prisma.movement.upsert({
        where: { pointId_productId_date: { pointId: m.pointId, productId: m.productId, date } },
        create: {
          pointId: m.pointId,
          productId: m.productId,
          date,
          prihod: m.prihod,
          ostatok: m.ostatok,
          spisanie: m.spisanie,
          soldCalc: m.soldCalc,
          sheetId,
          manuallyEdited: true,
        },
        update: {
          prihod: m.prihod,
          ostatok: m.ostatok,
          spisanie: m.spisanie,
          soldCalc: m.soldCalc,
          manuallyEdited: true,
        },
      });
    }),
  );
}

/** Перевод листа в confirmed. */
export async function confirmSheet(prisma: PrismaClient, sheetId: string): Promise<void> {
  await prisma.sheet.update({
    where: { id: sheetId },
    data: { status: 'confirmed', confirmedAt: new Date() },
  });
}

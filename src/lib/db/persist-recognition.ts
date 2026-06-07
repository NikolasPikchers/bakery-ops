import type { PrismaClient } from '@prisma/client';
import type { RecognitionRecords } from '@/lib/persistence/recognition-to-records';
import { backfillCrossSheetSold } from './backfill-sold';
import {
  findSheetByImageHash,
  getPreviousOstatok,
  createSheet,
  upsertMovements,
  createUnknownLines,
} from './movements-repo';

export type PersistResult = { deduped: boolean; sheetId: string };

export async function persistRecognition(
  prisma: PrismaClient,
  records: RecognitionRecords,
): Promise<PersistResult> {
  const existing = await findSheetByImageHash(prisma, records.sheet.imageHash);
  if (existing) return { deduped: true, sheetId: existing.id };

  const movements = await backfillCrossSheetSold(records.movements, (pointId, productId, beforeDate) =>
    getPreviousOstatok(prisma, pointId, productId, beforeDate),
  );

  // Атомарно: иначе при падении между записями Sheet остаётся без движений,
  // а повтор дедупится по imageHash и лист «залипает» недописанным.
  // Дефолтный interactive-таймаут Prisma — 5с; лист с 18–28 SKU × N дат = десятки
  // последовательных upsert по serverless-Neon легко превышают его (P2028). Поднимаем.
  await prisma.$transaction(
    async (tx) => {
      await createSheet(tx, records.sheet);
      await upsertMovements(tx, movements);
      await createUnknownLines(tx, records.unknownLines);
    },
    { maxWait: 15_000, timeout: 60_000 },
  );

  return { deduped: false, sheetId: records.sheet.id };
}

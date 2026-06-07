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

  await createSheet(prisma, records.sheet);
  await upsertMovements(prisma, movements);
  await createUnknownLines(prisma, records.unknownLines);

  return { deduped: false, sheetId: records.sheet.id };
}

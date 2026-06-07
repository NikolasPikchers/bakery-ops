import { Prisma, type PrismaClient } from '@prisma/client';
import { toDbDate } from './dates';
import type {
  SheetRecord,
  MovementRecord,
  UnknownLineRecord,
} from '@/lib/persistence/recognition-to-records';

/**
 * Минимальный контракт клиента (нужные делегаты). Ему удовлетворяет и PrismaClient,
 * и Prisma.TransactionClient (tx из $transaction) — чтобы репозитории работали внутри транзакции.
 */
export type DbClient = Pick<PrismaClient, 'sheet' | 'movement' | 'unknownLine'>;

export async function findSheetByImageHash(prisma: DbClient, imageHash: string) {
  return prisma.sheet.findFirst({ where: { imageHash } });
}

export async function getPreviousOstatok(
  prisma: DbClient,
  pointId: string,
  productId: string,
  beforeDate: string,
): Promise<number | null> {
  const prev = await prisma.movement.findFirst({
    where: { pointId, productId, date: { lt: toDbDate(beforeDate) }, ostatok: { not: null } },
    orderBy: { date: 'desc' },
    select: { ostatok: true },
  });
  return prev?.ostatok ?? null;
}

export async function createSheet(prisma: DbClient, sheet: SheetRecord) {
  return prisma.sheet.create({
    data: {
      id: sheet.id,
      pointId: sheet.pointId,
      sheetType: sheet.sheetType,
      imageUrl: sheet.imageUrl,
      imageHash: sheet.imageHash,
      dates: sheet.dates.map(toDbDate),
      source: sheet.source,
      uploadedBy: sheet.uploadedBy ?? undefined,
      status: sheet.status,
      rawRecognition: sheet.rawRecognition as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function upsertMovements(prisma: DbClient, movements: MovementRecord[]) {
  for (const m of movements) {
    const date = toDbDate(m.date);
    await prisma.movement.upsert({
      where: { pointId_productId_date: { pointId: m.pointId, productId: m.productId, date } },
      create: {
        pointId: m.pointId,
        productId: m.productId,
        date,
        prihod: m.prihod,
        ostatok: m.ostatok,
        spisanie: m.spisanie,
        soldCalc: m.soldCalc,
        sheetId: m.sheetId,
        confidence: m.confidence,
        rawCell: m.rawCell as unknown as Prisma.InputJsonValue,
        manuallyEdited: m.manuallyEdited,
      },
      update: {
        prihod: m.prihod,
        ostatok: m.ostatok,
        spisanie: m.spisanie,
        soldCalc: m.soldCalc,
        sheetId: m.sheetId,
        confidence: m.confidence,
        rawCell: m.rawCell as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

export async function createUnknownLines(prisma: DbClient, lines: UnknownLineRecord[]) {
  if (lines.length === 0) return;
  await prisma.unknownLine.createMany({
    data: lines.map((l) => ({
      sheetId: l.sheetId,
      pointId: l.pointId,
      date: l.date ? toDbDate(l.date) : null,
      rawText: l.rawText,
      parsedNumbers: l.parsedNumbers ?? undefined,
      status: l.status,
    })),
  });
}

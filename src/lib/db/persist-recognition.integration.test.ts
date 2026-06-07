import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { persistRecognition } from './persist-recognition';
import { findSheetByImageHash } from './movements-repo';
import type { RecognitionRecords } from '@/lib/persistence/recognition-to-records';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('persistRecognition (реальная БД)', () => {
  let prisma: PrismaClient;
  const hash = `test-${Date.now()}`;

  beforeAll(async () => {
    prisma = new PrismaClient();
    await prisma.point.upsert({ where: { id: 'pt-test' }, update: {}, create: { id: 'pt-test', name: 'TEST POINT' } });
    await prisma.product.upsert({
      where: { name_sheetType: { name: 'TEST SKU', sheetType: 'pies' } },
      update: {}, create: { id: 'pr-test', name: 'TEST SKU', sheetType: 'pies' },
    });
  });

  afterAll(async () => {
    await prisma.movement.deleteMany({ where: { pointId: 'pt-test' } });
    await prisma.unknownLine.deleteMany({ where: { pointId: 'pt-test' } });
    await prisma.sheet.deleteMany({ where: { imageHash: hash } });
    await prisma.$disconnect();
  });

  it('пишет Sheet + Movement и дедупит повтор', async () => {
    const records: RecognitionRecords = {
      sheet: {
        id: `sh-${hash}`, pointId: 'pt-test', sheetType: 'pies',
        imageUrl: 'blob://t', imageHash: hash, dates: ['2026-06-06'],
        source: 'web', uploadedBy: null, status: 'recognized',
        rawRecognition: { pointHint: null, sheetType: 'pies', dates: ['2026-06-06'], rows: [], unknownLines: [], warnings: [] },
      },
      movements: [{
        pointId: 'pt-test', productId: 'pr-test', date: '2026-06-06',
        prihod: 8, ostatok: 9, spisanie: null, soldCalc: null,
        sheetId: `sh-${hash}`, confidence: 1, rawCell: { prihod: '8', ostatok: '9', spisanie: '' }, manuallyEdited: false,
      }],
      unknownLines: [],
    };
    const first = await persistRecognition(prisma, records);
    expect(first.deduped).toBe(false);
    expect(await findSheetByImageHash(prisma, hash)).not.toBeNull();
    const second = await persistRecognition(prisma, records);
    expect(second.deduped).toBe(true);
  }, 30_000);
});

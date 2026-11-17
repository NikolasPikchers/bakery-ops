import { getPrisma } from '@/lib/db/client';
import { getBlobStore } from '@/lib/storage';
import { recognizeSheet } from '@/lib/recognition/recognize-sheet';
import { persistRecognition } from '@/lib/db/persist-recognition';
import { findSheetByImageHash } from '@/lib/db/movements-repo';
import type { IngestDeps } from './ingest-sheet';

/** Боевые зависимости пайплайна для серверных маршрутов. Тесты используют свои стабы. */
export function buildIngestDeps(): IngestDeps {
  const prisma = getPrisma();
  return {
    blob: getBlobStore(),
    recognize: (args) => recognizeSheet(args),
    findSheetByHash: (hash) => findSheetByImageHash(prisma, hash),
    persist: (records) => persistRecognition(prisma, records),
    newId: () => crypto.randomUUID(),
  };
}

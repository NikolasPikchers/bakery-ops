import { computeImageHash } from '@/lib/persistence/image-hash';
import { recognitionToRecords, type RecognitionRecords } from '@/lib/persistence/recognition-to-records';
import type { BlobStore } from '@/lib/storage/blob';
import type { CatalogEntry } from '@/lib/recognition/match-product';
import type { RecognitionResult } from '@/lib/recognition/schema';
import type { SheetType } from '@/lib/domain/types';

export type IngestInput = {
  bytes: Uint8Array;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  pointId: string;
  sheetType: SheetType;
  source: 'telegram' | 'web';
  uploadedBy?: string | null;
  catalog: CatalogEntry[];
};

export type IngestDeps = {
  blob: BlobStore;
  recognize: (args: {
    image: { kind: 'base64'; mediaType: IngestInput['mediaType']; data: string };
    catalog: CatalogEntry[];
    sheetType: SheetType;
  }) => Promise<RecognitionResult>;
  findSheetByHash: (hash: string) => Promise<{ id: string } | null>;
  persist: (records: RecognitionRecords) => Promise<{ deduped: boolean; sheetId: string }>;
  newId: () => string;
};

export type IngestResult = {
  sheetId: string;
  status: 'recognized' | 'needs_review' | 'duplicate';
  deduped: boolean;
};

export async function ingestSheetPhoto(input: IngestInput, deps: IngestDeps): Promise<IngestResult> {
  const imageHash = computeImageHash(input.bytes);

  const existing = await deps.findSheetByHash(imageHash);
  if (existing) return { sheetId: existing.id, status: 'duplicate', deduped: true };

  const sheetId = deps.newId();
  const ext = input.mediaType === 'image/png' ? 'png' : input.mediaType === 'image/webp' ? 'webp' : 'jpg';
  const { url } = await deps.blob.put(`sheets/${sheetId}.${ext}`, input.bytes, input.mediaType);

  const result = await deps.recognize({
    image: { kind: 'base64', mediaType: input.mediaType, data: Buffer.from(input.bytes).toString('base64') },
    catalog: input.catalog,
    sheetType: input.sheetType,
  });

  const records = recognitionToRecords(result, {
    pointId: input.pointId,
    sheetId,
    imageUrl: url,
    imageHash,
    source: input.source,
    uploadedBy: input.uploadedBy ?? null,
  });

  await deps.persist(records);
  return { sheetId, status: records.sheet.status, deduped: false };
}

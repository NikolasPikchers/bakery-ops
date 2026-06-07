import { describe, it, expect, vi } from 'vitest';
import { ingestSheetPhoto, type IngestDeps } from './ingest-sheet';
import type { CatalogEntry } from '@/lib/recognition/match-product';
import type { RecognitionResult } from '@/lib/recognition/schema';

const catalog: CatalogEntry[] = [{ id: 'p5', name: 'Самса' }];

const recogResult: RecognitionResult = {
  pointHint: 'Точка 1', sheetType: 'pies', dates: ['2026-06-06'],
  rows: [{
    productName: 'Самса', matchedProductId: 'p5', matchConfidence: 1,
    cells: [{ date: '2026-06-06',
      prihod: { value: 8, raw: '8', parts: [8], ambiguous: false },
      ostatok: { value: 9, raw: '9', parts: [9], ambiguous: false },
      spisanie: { value: null, raw: '', parts: [], ambiguous: false } }],
  }],
  unknownLines: [], warnings: [],
};

function deps(overrides: Partial<IngestDeps> = {}): IngestDeps {
  return {
    blob: { put: vi.fn(async () => ({ url: 'blob://sheets/x.jpg' })) },
    recognize: vi.fn(async () => recogResult),
    findSheetByHash: vi.fn(async () => null),
    persist: vi.fn(async () => ({ deduped: false, sheetId: 'sh-new' })),
    newId: () => 'sh-new',
    ...overrides,
  };
}

const input = {
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: 'image/jpeg' as const,
  pointId: 'pt1', sheetType: 'pies' as const, source: 'telegram' as const,
  uploadedBy: null, catalog,
};

describe('ingestSheetPhoto', () => {
  it('новый лист: blob → recognize → persist, статус из записей', async () => {
    const d = deps();
    const res = await ingestSheetPhoto(input, d);
    expect(d.blob.put).toHaveBeenCalledOnce();
    expect(d.recognize).toHaveBeenCalledOnce();
    expect(d.persist).toHaveBeenCalledOnce();
    expect(res).toMatchObject({ sheetId: 'sh-new', status: 'recognized', deduped: false });
  });

  it('дубликат (хэш уже есть): не грузит в blob, не распознаёт', async () => {
    const d = deps({ findSheetByHash: vi.fn(async () => ({ id: 'sh-old' })) });
    const res = await ingestSheetPhoto(input, d);
    expect(res).toMatchObject({ sheetId: 'sh-old', status: 'duplicate', deduped: true });
    expect(d.blob.put).not.toHaveBeenCalled();
    expect(d.recognize).not.toHaveBeenCalled();
  });
});

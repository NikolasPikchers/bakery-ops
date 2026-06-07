import { computeSold } from '@/lib/domain/computeSold';
import type { SheetType } from '@/lib/domain/types';
import type { RecognitionResult, RecognizedRow } from '@/lib/recognition/schema';

export type PersistContext = {
  pointId: string;
  sheetId: string;
  imageUrl: string;
  imageHash: string;
  source: 'telegram' | 'web';
  uploadedBy?: string | null;
};

export type SheetRecord = {
  id: string;
  pointId: string;
  sheetType: SheetType;
  imageUrl: string;
  imageHash: string;
  dates: string[];
  source: 'telegram' | 'web';
  uploadedBy: string | null;
  status: 'recognized' | 'needs_review';
  rawRecognition: RecognitionResult;
};

export type MovementRecord = {
  pointId: string;
  productId: string;
  date: string;
  prihod: number | null;
  ostatok: number | null;
  spisanie: number | null;
  soldCalc: number | null;
  sheetId: string;
  confidence: number;
  rawCell: { prihod: string; ostatok: string; spisanie: string };
  manuallyEdited: boolean;
};

export type UnknownLineRecord = {
  sheetId: string;
  pointId: string;
  date: string | null;
  rawText: string;
  parsedNumbers: null;
  status: 'pending';
};

export type RecognitionRecords = {
  sheet: SheetRecord;
  movements: MovementRecord[];
  unknownLines: UnknownLineRecord[];
};

function rowHasAmbiguousCell(row: RecognizedRow): boolean {
  return row.cells.some(
    (c) => c.prihod.ambiguous || c.ostatok.ambiguous || c.spisanie.ambiguous,
  );
}

function movementsForRow(row: RecognizedRow, ctx: PersistContext): MovementRecord[] {
  if (row.matchedProductId === null) return [];
  // Сортируем по дате, чтобы prevOstatok корректно цепочкой шёл вперёд независимо от порядка строк модели.
  const cells = [...row.cells].sort((a, b) => a.date.localeCompare(b.date));
  return cells.map((cell, i) => {
    const prevOstatok = i > 0 ? cells[i - 1].ostatok.value : null;
    // sold может быть отрицательным (computeSold.anomaly) — у Movement нет колонки anomaly,
    // поэтому аномалии выявляются downstream запросом soldCalc < 0 (учесть в 3b/дашборде).
    const { sold } = computeSold({
      prevOstatok,
      prihod: cell.prihod.value,
      spisanie: cell.spisanie.value,
      ostatok: cell.ostatok.value,
    });
    return {
      pointId: ctx.pointId,
      // matchedProductId !== null гарантировано early return выше.
      productId: row.matchedProductId as string,
      date: cell.date,
      prihod: cell.prihod.value,
      ostatok: cell.ostatok.value,
      spisanie: cell.spisanie.value,
      soldCalc: sold,
      sheetId: ctx.sheetId,
      confidence: row.matchConfidence,
      rawCell: { prihod: cell.prihod.raw, ostatok: cell.ostatok.raw, spisanie: cell.spisanie.raw },
      manuallyEdited: false,
    };
  });
}

export function recognitionToRecords(
  result: RecognitionResult,
  ctx: PersistContext,
): RecognitionRecords {
  const needsReview =
    result.unknownLines.length > 0 ||
    result.rows.some((r) => r.matchedProductId === null) ||
    result.rows.some(rowHasAmbiguousCell);

  const sheet: SheetRecord = {
    id: ctx.sheetId,
    pointId: ctx.pointId,
    sheetType: result.sheetType,
    imageUrl: ctx.imageUrl,
    imageHash: ctx.imageHash,
    dates: result.dates,
    source: ctx.source,
    uploadedBy: ctx.uploadedBy ?? null,
    status: needsReview ? 'needs_review' : 'recognized',
    rawRecognition: result,
  };

  const movements = result.rows.flatMap((row) => movementsForRow(row, ctx));

  const unknownLines: UnknownLineRecord[] = result.unknownLines.map((u) => ({
    sheetId: ctx.sheetId,
    pointId: ctx.pointId,
    date: null,
    rawText: u.rawText,
    parsedNumbers: null,
    status: 'pending',
  }));

  return { sheet, movements, unknownLines };
}

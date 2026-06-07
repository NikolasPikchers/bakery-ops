import { parseQuantity } from '@/lib/domain/parseQuantity';
import { matchProductToCatalog, type CatalogEntry } from './match-product';
import type { RawRecognition, RecognitionResult } from './schema';

export function normalizeRecognition(
  raw: RawRecognition,
  catalog: CatalogEntry[],
): RecognitionResult {
  return {
    pointHint: raw.pointHint,
    sheetType: raw.sheetType,
    dates: raw.dates,
    warnings: raw.warnings,
    unknownLines: raw.unknownLines,
    rows: raw.rows.map((row) => {
      const match = matchProductToCatalog(row.productName, catalog);
      return {
        productName: row.productName,
        matchedProductId: match.productId,
        matchConfidence: match.confidence,
        cells: row.cells.map((cell) => ({
          date: cell.date,
          prihod: parseQuantity(cell.prihod),
          ostatok: parseQuantity(cell.ostatok),
          spisanie: parseQuantity(cell.spisanie),
        })),
      };
    }),
  };
}

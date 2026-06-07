import { z } from 'zod';
import type { ParsedQuantity, SheetType } from '@/lib/domain/types';

export const SHEET_TYPES = ['pies', 'desserts', 'confectionery_freeform'] as const;

export const RawCellSchema = z.object({
  date: z.string(),
  prihod: z.string().nullable(),
  ostatok: z.string().nullable(),
  spisanie: z.string().nullable(),
});
export const RawRowSchema = z.object({
  productName: z.string(),
  cells: z.array(RawCellSchema),
});
export const RawUnknownLineSchema = z.object({
  rawText: z.string(),
  note: z.string().nullable(),
});
export const RawRecognitionSchema = z.object({
  pointHint: z.string().nullable(),
  sheetType: z.enum(SHEET_TYPES),
  dates: z.array(z.string()),
  rows: z.array(RawRowSchema),
  unknownLines: z.array(RawUnknownLineSchema),
  warnings: z.array(z.string()),
});

export type RawRecognition = z.infer<typeof RawRecognitionSchema>;
export type RawRow = z.infer<typeof RawRowSchema>;
export type RawCell = z.infer<typeof RawCellSchema>;

/** Нормализованная ячейка: числа разобраны parseQuantity. */
export type NormalizedCell = {
  date: string;
  prihod: ParsedQuantity;
  ostatok: ParsedQuantity;
  spisanie: ParsedQuantity;
};
export type RecognizedRow = {
  productName: string;
  matchedProductId: string | null;
  matchConfidence: number;
  cells: NormalizedCell[];
};
export type RecognitionResult = {
  pointHint: string | null;
  sheetType: SheetType;
  dates: string[];
  rows: RecognizedRow[];
  unknownLines: { rawText: string; note: string | null }[];
  warnings: string[];
};

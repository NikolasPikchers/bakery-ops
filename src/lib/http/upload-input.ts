import { SHEET_TYPES } from '@/lib/recognition/schema';
import type { SheetType } from '@/lib/domain/types';

const POINTS = ['point-1', 'point-2'] as const;
const MEDIA = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type UploadMediaType = (typeof MEDIA)[number];

export type ParsedUpload = { pointId: string; sheetType: SheetType; mediaType: UploadMediaType };
export type ParseResult =
  | { ok: true; value: ParsedUpload }
  | { ok: false; error: string };

export function parseUploadFields(input: {
  pointId: unknown;
  sheetType: unknown;
  file: { type: string } | null;
}): ParseResult {
  if (!POINTS.includes(input.pointId as (typeof POINTS)[number]))
    return { ok: false, error: 'Неизвестная точка' };
  if (!SHEET_TYPES.includes(input.sheetType as SheetType))
    return { ok: false, error: 'Неизвестный тип листа' };
  if (!input.file) return { ok: false, error: 'Нет файла' };
  if (!MEDIA.includes(input.file.type as UploadMediaType))
    return { ok: false, error: 'Поддерживаются только JPEG/PNG/WebP' };
  return {
    ok: true,
    value: {
      pointId: input.pointId as string,
      sheetType: input.sheetType as SheetType,
      mediaType: input.file.type as UploadMediaType,
    },
  };
}

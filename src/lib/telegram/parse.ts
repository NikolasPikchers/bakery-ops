import { pointIdFromInput, type PointId } from '@/lib/domain/points';
import type { SheetType } from '@/lib/domain/types';

export type TgMessage = { chatId: number; text: string; photoFileId: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractMessage(update: any): TgMessage | null {
  const m = update?.message;
  if (!m || !m.chat || typeof m.chat.id !== 'number') return null;
  const text: string = m.caption ?? m.text ?? '';
  const photos = Array.isArray(m.photo) ? m.photo : [];
  const photoFileId = photos.length ? photos[photos.length - 1].file_id : null;
  return { chatId: m.chat.id, text, photoFileId };
}

export function parseCaption(text: string): { pointId: PointId; sheetType: SheetType } | null {
  const t = text.toLowerCase();

  let pointId: PointId | null = null;
  for (const token of t.split(/\s+/)) {
    const p = pointIdFromInput(token);
    if (p) { pointId = p; break; }
  }

  let sheetType: SheetType | null = null;
  if (/десерт/.test(t)) sheetType = 'desserts';
  else if (/кондитер|рукопис/.test(t)) sheetType = 'confectionery_freeform';
  else if (/пирог|выпечк/.test(t)) sheetType = 'pies';

  if (!pointId || !sheetType) return null;
  return { pointId, sheetType };
}

export function parseAllowedChatIds(raw: string): number[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
}

export function isAllowed(chatId: number, allowed: number[]): boolean {
  return allowed.includes(chatId);
}

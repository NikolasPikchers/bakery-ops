import { parseSyncRange as parseRange } from '../sync-range';

/** Т-API отдаёт выписку не длиннее квартала за раз — столько и разрешаем. */
export const TBANK_MAX_DAYS = 93;

export function parseSyncRange(from: unknown, till: unknown, maxDays = TBANK_MAX_DAYS): { from: string; till: string } | { error: string } {
  return parseRange(from, till, maxDays);
}

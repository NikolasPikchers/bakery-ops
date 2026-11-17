/** Период синхронизации из запроса: обе даты ГГГГ-ММ-ДД, «по» не раньше «с», не длиннее maxDays. */
export const TBANK_MAX_DAYS = 93;

const isIsoDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00.000Z`).toISOString().slice(0, 10) === s;

export function parseSyncRange(from: unknown, till: unknown, maxDays = TBANK_MAX_DAYS): { from: string; till: string } | { error: string } {
  if (!isIsoDate(from) || !isIsoDate(till)) return { error: 'Неверная дата' };
  const days = (Date.parse(till) - Date.parse(from)) / 86_400_000 + 1;
  if (days < 1) return { error: 'Дата «по» раньше «с»' };
  if (days > maxDays) return { error: `Период больше ${maxDays} дней — загрузите частями` };
  return { from, till };
}

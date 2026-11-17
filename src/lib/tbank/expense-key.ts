// Ключ расхода из банка: «счёт|номер платежа|дата|сумма». Файл-выписка и T-API пишут дату и
// сумму по-разному («31.10.2026|406,7» и «2026-10-31|406.70»), поэтому сравниваем канонический вид.
// Сверено на проде: documentNumber из API = «Номер платежа» из файла, operationDate = дата.
import { parseAmount, toIsoDate } from './parse-statement';

/** externalId (из файла или из API) → «счёт|номер|ГГГГ-ММ-ДД|сумма.00»; не ключ — null. */
export function canonicalExpenseKey(externalId: string): string | null {
  const parts = externalId.split('|');
  if (parts.length !== 4) return null;
  const [acc, num, date, amount] = parts;
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(date) ? date : toIsoDate(date);
  if (!acc || !iso || amount === '') return null;
  return `${acc}|${num}|${iso}|${parseAmount(amount).toFixed(2)}`;
}

/** externalId операции из T-API — сразу в каноническом виде. */
export function apiExternalId(accountNumber: string, documentNumber: string, isoDate: string, amount: number): string {
  return `${accountNumber}|${documentNumber}|${isoDate}|${Math.abs(amount).toFixed(2)}`;
}

/**
 * Подменяет externalId строк на уже существующий в базе, если это та же операция в другом
 * формате записи. Так операция, загруженная раньше из файла, обновляется, а не дублируется.
 */
export function reconcileExternalIds<T extends { externalId: string }>(rows: T[], existing: string[]): { rows: T[]; matched: number } {
  const byKey = new Map<string, string>();
  for (const id of existing) {
    const k = canonicalExpenseKey(id);
    if (k) byKey.set(k, id);
  }
  let matched = 0;
  const out = rows.map((r) => {
    const k = canonicalExpenseKey(r.externalId);
    const have = k ? byKey.get(k) : undefined;
    if (have === undefined) return r;
    matched++;
    return have === r.externalId ? r : { ...r, externalId: have };
  });
  return { rows: out, matched };
}

import { pointIdFromInput } from '@/lib/domain/points';
import { categoryFromInput, type ExpenseCategoryKey } from './categories';

export type RevenueCsvRow = { pointId: string; date: string; amount: number; note?: string };
export type ExpenseCsvRow = { pointId: string; date: string; amount: number; category: ExpenseCategoryKey; note?: string };
export type CsvError = { line: number; reason: string };
export type CsvResult<T> = { rows: T[]; errors: CsvError[] };

function normDate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function normAmount(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Минимальный CSV-сплиттер строки: поддерживает кавычки вокруг поля (для запятой в числе/заметке).
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function rows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(splitCsvLine);
}

export function parseRevenueCsv(text: string): CsvResult<RevenueCsvRow> {
  const all = rows(text);
  const out: RevenueCsvRow[] = [];
  const errors: CsvError[] = [];
  for (let i = 1; i < all.length; i++) {
    const line = i + 1;
    const [dateRaw = '', pointRaw = '', amountRaw = '', noteRaw = ''] = all[i];
    const date = normDate(dateRaw);
    const pointId = pointIdFromInput(pointRaw);
    const amount = normAmount(amountRaw);
    if (!date) { errors.push({ line, reason: `Неверная дата: "${dateRaw}"` }); continue; }
    if (!pointId) { errors.push({ line, reason: `Неизвестная точка: "${pointRaw}"` }); continue; }
    if (amount === null) { errors.push({ line, reason: `Неверная сумма: "${amountRaw}"` }); continue; }
    out.push({ pointId, date, amount, note: noteRaw.trim() || undefined });
  }
  return { rows: out, errors };
}

export function parseExpenseCsv(text: string): CsvResult<ExpenseCsvRow> {
  const all = rows(text);
  const out: ExpenseCsvRow[] = [];
  const errors: CsvError[] = [];
  for (let i = 1; i < all.length; i++) {
    const line = i + 1;
    const [dateRaw = '', pointRaw = '', catRaw = '', amountRaw = '', noteRaw = ''] = all[i];
    const date = normDate(dateRaw);
    const pointId = pointIdFromInput(pointRaw);
    const amount = normAmount(amountRaw);
    if (!date) { errors.push({ line, reason: `Неверная дата: "${dateRaw}"` }); continue; }
    if (!pointId) { errors.push({ line, reason: `Неизвестная точка: "${pointRaw}"` }); continue; }
    if (amount === null) { errors.push({ line, reason: `Неверная сумма: "${amountRaw}"` }); continue; }
    const matched = categoryFromInput(catRaw);
    const category: ExpenseCategoryKey = matched ?? 'prochee';
    const baseNote = noteRaw.trim();
    const note = matched ? (baseNote || undefined) : `категория: ${catRaw.trim()}${baseNote ? ` · ${baseNote}` : ''}`;
    out.push({ pointId, date, amount, category, note });
  }
  return { rows: out, errors };
}

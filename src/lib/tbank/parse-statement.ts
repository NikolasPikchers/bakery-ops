import type { BankOperation } from './types';

// Парсер CSV-выписки Т-Бизнес (；-разделитель, UTF-8 BOM, кавычки с экранированием "").
// Это единственное место, зависящее от формата выгрузки банка. Маппинг — по ИМЕНАМ колонок,
// поэтому устойчив к их перестановке и к наличию лишних колонок.

const COL = {
  account: 'Номер счёта',
  type: 'Тип операции (пополнение/списание)',
  date: 'Дата проведения',
  payno: 'Номер платежа',
  amount: 'Сумма в валюте счёта',
  purpose: 'Назначение платежа',
  description: 'Описание операции',
  cpName: 'Наименование контрагента',
  cpInn: 'ИНН контрагента',
} as const;

/** RFC4180-подобный разбор с настраиваемым разделителем. Снимает BOM. */
export function parseDelimited(text: string, delim = ';'): string[][] {
  const s = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (inQuotes) {
      if (c === '"') {
        if (s[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const clean = (v: string | undefined): string | null => {
  const t = (v ?? '').trim();
  return t.length ? t : null;
};

/** «1 234,56» / «189,0» → число (абсолютное). */
export function parseAmount(s: string): number {
  const n = Number((s ?? '').replace(/[\s ]/g, '').replace(',', '.'));
  return Number.isFinite(n) ? Math.abs(n) : 0;
}

/** «ДД.ММ.ГГГГ» → «ГГГГ-ММ-ДД» (или '' если формат не распознан). */
export function toIsoDate(s: string): string {
  const m = (s ?? '').trim().match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : '';
}

export function parseStatementCsv(text: string): BankOperation[] {
  const rows = parseDelimited(text, ';');
  if (rows.length === 0) return [];
  const header = rows[0].map((h) => h.trim());
  const idx = (name: string): number => {
    const i = header.indexOf(name);
    if (i < 0) throw new Error(`В выписке нет колонки «${name}»`);
    return i;
  };
  const cAcc = idx(COL.account);
  const cType = idx(COL.type);
  const cDate = idx(COL.date);
  const cPayno = idx(COL.payno);
  const cAmt = idx(COL.amount);
  const cPur = idx(COL.purpose);
  const cDesc = idx(COL.description);
  const cName = idx(COL.cpName);
  const cInn = idx(COL.cpInn);

  const ops: BankOperation[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length < header.length) continue; // пустые/служебные строки
    const dateRaw = (row[cDate] ?? '').trim();
    const amtRaw = (row[cAmt] ?? '').trim();
    const type = (row[cType] ?? '').trim().toLowerCase();
    ops.push({
      id: `${(row[cAcc] ?? '').trim()}|${(row[cPayno] ?? '').trim()}|${dateRaw}|${amtRaw}`,
      date: toIsoDate(dateRaw),
      amount: parseAmount(amtRaw),
      direction: type.includes('дебет') ? 'out' : 'in',
      counterparty: clean(row[cName]),
      inn: clean(row[cInn]),
      purpose: clean(row[cPur]) ?? clean(row[cDesc]),
    });
  }
  return ops;
}

import ExcelJS from 'exceljs';

export type SalesPeriod = { from: string; till: string };

export type ParsedSales = {
  /** Σ выручки по строкам-блюдам, ₽ */
  total: number;
  /** Из неё кондитерка — строки с префиксом «\» */
  confectionery: number;
  /** Сколько строк-блюд учтено */
  positions: number;
  /** Период из шапки отчёта («Период  2026-08-21 — 2026-08-21»), если он есть в файле */
  period: SalesPeriod | null;
};

/** Текст ячейки (учитывая формулы и rich text). */
function cellText(v: unknown): string {
  if (v == null) return '';
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text?: string }[] };
    if (Array.isArray(o.richText)) return o.richText.map((r) => r.text ?? '').join('');
    if (o.text != null) return String(o.text);
    if (o.result != null) return String(o.result);
    return '';
  }
  return String(v);
}

/** Число из ячейки (формула → result, строка «1 234,5» → 1234.5). */
function cellNumber(v: unknown): number {
  if (typeof v === 'number') return v;
  if (v != null && typeof v === 'object') {
    const r = (v as { result?: unknown }).result;
    if (r != null) return cellNumber(r);
  }
  const s = cellText(v).replace(/\s| /g, '').replace(',', '.');
  return s.length > 0 ? Number(s) : NaN;
}

const norm = (s: string) => s.trim().toLowerCase();

const HEADER_SCAN_ROWS = 20;

type Layout = { headerRow: number; nameCol: number; revCol: number };

/** Ищет строку заголовков: колонку «Блюдо» и колонку выручки
 *  («Сумма продажи» в выгрузке «Категории и блюда», «…по выручке» в «Табличных данных»). */
function findLayout(ws: ExcelJS.Worksheet): Layout {
  for (let rowNum = 1; rowNum <= Math.min(HEADER_SCAN_ROWS, ws.rowCount); rowNum++) {
    const row = ws.getRow(rowNum);
    let nameCol = 0;
    let sumCol = 0;
    let revCol = 0;
    row.eachCell((cell, col) => {
      const t = norm(cellText(cell.value));
      if (t === 'блюдо' || t === 'название блюда') nameCol = col;
      else if (t.includes('сумма продаж')) sumCol = col;
      // «Доля в выручке» — это процент, а не деньги
      else if (t.includes('выручк') && !t.includes('доля')) revCol = col;
    });
    if (nameCol > 0) {
      const value = sumCol || revCol || nameCol + 2; // старый дефолт — 3-я колонка
      return { headerRow: rowNum, nameCol, revCol: value };
    }
  }
  throw new Error('Не найдена колонка «Блюдо» — это не выгрузка продаж iiko');
}

const ISO_DATE = /(\d{4})-(\d{2})-(\d{2})/;
const RU_DATE = /(\d{2})\.(\d{2})\.(\d{4})/;

/** «2026-08-21» / «21.08.2026» → ISO, иначе null. */
function toIso(s: string): string | null {
  const iso = s.match(ISO_DATE);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const ru = s.match(RU_DATE);
  if (ru) return `${ru[3]}-${ru[2]}-${ru[1]}`;
  return null;
}

/** Период из шапки: строка «Период | 2026-08-21 — 2026-08-21». */
function findPeriod(ws: ExcelJS.Worksheet): SalesPeriod | null {
  for (let rowNum = 1; rowNum <= Math.min(HEADER_SCAN_ROWS, ws.rowCount); rowNum++) {
    const row = ws.getRow(rowNum);
    let labelCol = 0;
    let text = '';
    row.eachCell((cell, col) => {
      const t = cellText(cell.value);
      if (labelCol === 0 && norm(t).startsWith('период')) labelCol = col;
      else if (labelCol > 0 && col > labelCol && text === '') text = t;
    });
    if (labelCol === 0) continue;
    // Период может быть и в самой ячейке-подписи: «Период: 21.08.2026 — 21.08.2026»
    const src = text || cellText(row.getCell(labelCol).value);
    const parts = src.split(/[—–]|\s+-\s+/).map((p) => p.trim()).filter(Boolean);
    const from = toIso(parts[0] ?? '');
    if (!from) continue;
    const till = toIso(parts[1] ?? '') ?? from;
    return { from, till };
  }
  return null;
}

/** Дневные продажи из xlsx-выгрузки iiko. Поддерживаются оба формата:
 *  «Табличные данные» (Блюдо | кол-во | выручка) и «Категории и блюда»
 *  (шапка с периодом, строки-категории без блюда, колонка «Сумма продажи»). */
export async function parseSalesXlsx(buf: ArrayBuffer | Uint8Array): Promise<ParsedSales> {
  const wb = new ExcelJS.Workbook();
  // Тип Buffer у exceljs расходится с @types/node — кастуем сигнатуру load к Uint8Array/ArrayBuffer.
  const load = wb.xlsx.load.bind(wb.xlsx) as (b: ArrayBuffer | Uint8Array) => Promise<unknown>;
  await load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Пустой xlsx');

  const { headerRow, nameCol, revCol } = findLayout(ws);

  let total = 0;
  let confectionery = 0; // кондитерка: строки с префиксом «\»
  let positions = 0;
  ws.eachRow((row, rowNum) => {
    if (rowNum <= headerRow) return;
    const name = cellText(row.getCell(nameCol).value).trim();
    if (name.length === 0) return; // строка-итог по категории или grand total: «Блюдо» пустое
    if (name.toLowerCase().includes('итог')) return; // подпись «Итого», если попадётся
    const v = cellNumber(row.getCell(revCol).value);
    if (Number.isFinite(v)) {
      total += v;
      positions++;
      if (name.startsWith('\\')) confectionery += v;
    }
  });
  const round2 = (n: number) => Math.round(n * 100) / 100;
  return { total: round2(total), confectionery: round2(confectionery), positions, period: findPeriod(ws) };
}

const FILENAME_DATE = /_(\d{2})\.(\d{2})\.(\d{2})\.xlsx$/i;

/** Дата из имени файла iiko «…_ДД.ММ.ГГ.xlsx» → ISO «20ГГ-ММ-ДД» (или null). */
export function dateFromFilename(name: string): string | null {
  const m = name.match(FILENAME_DATE);
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : null;
}

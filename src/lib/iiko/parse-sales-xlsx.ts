import ExcelJS from 'exceljs';

/** Сумма дневной выручки из xlsx-выгрузки iiko («Табличные данные»):
 *  Σ колонки «…по выручке» по строкам-блюдам (начинаются с «//» или «\»). */
export async function parseSalesXlsx(buf: ArrayBuffer | Uint8Array): Promise<{ total: number; positions: number }> {
  const wb = new ExcelJS.Workbook();
  // Тип Buffer у exceljs расходится с @types/node — кастуем сигнатуру load к Uint8Array/ArrayBuffer.
  const load = wb.xlsx.load.bind(wb.xlsx) as (b: ArrayBuffer | Uint8Array) => Promise<unknown>;
  await load(buf);
  const ws = wb.worksheets[0];
  if (!ws) throw new Error('Пустой xlsx');

  let revCol = 3; // дефолт — 3-я колонка
  ws.getRow(1).eachCell((cell, col) => {
    if (String(cell.value ?? '').toLowerCase().includes('выручк')) revCol = col;
  });

  let total = 0;
  let positions = 0;
  ws.eachRow((row, rowNum) => {
    if (rowNum === 1) return;
    const name = String(row.getCell(1).value ?? '').trim();
    if (name.length === 0) return; // строка-итог: «Блюдо» пустое
    if (name.toLowerCase().includes('итог')) return; // подпись «Итого», если попадётся
    const v = Number(row.getCell(revCol).value);
    if (Number.isFinite(v)) {
      total += v;
      positions++;
    }
  });
  return { total: Math.round(total * 100) / 100, positions };
}

const FILENAME_DATE = /_(\d{2})\.(\d{2})\.(\d{2})\.xlsx$/i;

/** Дата из имени файла iiko «…_ДД.ММ.ГГ.xlsx» → ISO «20ГГ-ММ-ДД» (или null). */
export function dateFromFilename(name: string): string | null {
  const m = name.match(FILENAME_DATE);
  return m ? `20${m[3]}-${m[2]}-${m[1]}` : null;
}

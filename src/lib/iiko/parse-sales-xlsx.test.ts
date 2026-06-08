import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseSalesXlsx, dateFromFilename } from './parse-sales-xlsx';

async function makeXlsx(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Табличные данные');
  ws.addRow(['Блюдо', 'Продажи блюд по размеру, по кол-ву', 'Продажи блюд по размерам, по выручке']);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('parseSalesXlsx', () => {
  it('суммирует все строки-блюда (с префиксом и без), исключая строку-итог', async () => {
    const buf = await makeXlsx([
      ['// Пирог 100', 5, 500], // пироги
      ['\\ Десерт 150', 2, 300], // десерты
      ['Капучино 139', 3, 410], // напиток без префикса — раньше терялся
      ['Итого', 10, 9999], // подпись «Итого» — исключаем
      [null, 419, 1210], // grand total с пустым «Блюдо» — исключаем
    ]);
    expect(await parseSalesXlsx(buf)).toEqual({ total: 1210, confectionery: 300, positions: 3 });
  });
});

describe('dateFromFilename', () => {
  it('парсит дату из кривого имени iiko', () => {
    expect(dateFromFilename('()=>{...}_07.06.26.xlsx')).toBe('2026-06-07');
    expect(dateFromFilename('foo.xlsx')).toBeNull();
  });
});

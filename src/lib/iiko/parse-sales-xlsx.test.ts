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
  it('суммирует колонку выручки по строкам-блюдам, игнорит прочее', async () => {
    const buf = await makeXlsx([
      ['// Пирог 100', 5, 500],
      ['\\ Десерт 150', 2, 300],
      ['Итого', null, 9999],
    ]);
    expect(await parseSalesXlsx(buf)).toEqual({ total: 800, positions: 2 });
  });
});

describe('dateFromFilename', () => {
  it('парсит дату из кривого имени iiko', () => {
    expect(dateFromFilename('()=>{...}_07.06.26.xlsx')).toBe('2026-06-07');
    expect(dateFromFilename('foo.xlsx')).toBeNull();
  });
});

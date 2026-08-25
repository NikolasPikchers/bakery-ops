import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { parseSalesXlsx, dateFromFilename } from './parse-sales-xlsx';

/** Старая выгрузка: лист «Табличные данные», заголовки в первой строке. */
async function makePlainXlsx(rows: unknown[][]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Табличные данные');
  ws.addRow(['Блюдо', 'Продажи блюд по размеру, по кол-ву', 'Продажи блюд по размерам, по выручке']);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

/** Новая выгрузка: лист «Категории и блюда», шапка с периодом, заголовки в 6-й строке,
 *  строки-категории (без блюда) с итогами и колонка «Доля в выручке». */
async function makeCategoriesXlsx(rows: unknown[][], period = '2026-08-21 — 2026-08-21'): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Категории и блюда');
  ws.addRow(['Категории и блюда']);
  ws.addRow(['Период', period]);
  ws.addRow(['CRMID', '2856744']);
  ws.addRow(['Рестораны', 'выбрано: 1']);
  ws.addRow([]);
  ws.addRow(['Категория', 'Блюдо', 'Кол-во', 'Цена', 'До скидки', 'Скидки и надбавки', 'Ср. цена со скидкой', 'Модификаторы', 'Сумма продажи', 'К прошлому периоду', 'Доля в выручке']);
  for (const r of rows) ws.addRow(r);
  return Buffer.from(await wb.xlsx.writeBuffer());
}

describe('parseSalesXlsx · «Табличные данные» (старый формат)', () => {
  it('суммирует все строки-блюда (с префиксом и без), исключая строку-итог', async () => {
    const buf = await makePlainXlsx([
      ['// Пирог 100', 5, 500], // пироги
      ['\\ Десерт 150', 2, 300], // десерты
      ['Капучино 139', 3, 410], // напиток без префикса — раньше терялся
      ['Итого', 10, 9999], // подпись «Итого» — исключаем
      [null, 419, 1210], // grand total с пустым «Блюдо» — исключаем
    ]);
    expect(await parseSalesXlsx(buf)).toEqual({ total: 1210, confectionery: 300, positions: 3, period: null });
  });
});

describe('parseSalesXlsx · «Категории и блюда» (новый формат)', () => {
  it('берёт «Сумму продажи» по строкам-блюдам, пропуская итоги категорий', async () => {
    const buf = await makeCategoriesXlsx([
      ['Без категории', null, 400, 131.9, 52762, -235.6, 131.3, 0, 900, 0.12, 1], // итог категории — пропустить
      [null, '// Пицца куриная 149', 30, 149, 4470, -59.6, 147, 0, 500, 0.74, 0.55],
      [null, '\\ Чизкейк 285', 7, 285, 1995, 0, 285, 0, 300, 6, 0.33],
      [null, 'Круассан Вар Сгущ 85', 15, 85, 1275, 0, 85, 0, 100, null, 0.11],
    ]);
    expect(await parseSalesXlsx(buf)).toEqual({
      total: 900,
      confectionery: 300,
      positions: 3,
      period: { from: '2026-08-21', till: '2026-08-21' },
    });
  });

  it('период за несколько дней и в формате ДД.ММ.ГГГГ', async () => {
    const buf = await makeCategoriesXlsx([[null, '// Пирог 100', 1, 100, 100, 0, 100, 0, 100, null, 1]], '21.08.2026 — 24.08.2026');
    const r = await parseSalesXlsx(buf);
    expect(r.period).toEqual({ from: '2026-08-21', till: '2026-08-24' });
  });

  it('не путает «Долю в выручке» с суммой', async () => {
    const buf = await makeCategoriesXlsx([[null, '// Пирог 100', 1, 100, 100, 0, 100, 0, 1234.5, null, 1]]);
    expect((await parseSalesXlsx(buf)).total).toBe(1234.5);
  });

  it('файл без колонки «Блюдо» — понятная ошибка', async () => {
    const wb = new ExcelJS.Workbook();
    const ws = wb.addWorksheet('Что-то другое');
    ws.addRow(['Название', 'Стоимость, ₽']);
    ws.addRow(['Сникерс (бенто 900гр)', 1950]);
    const buf = Buffer.from(await wb.xlsx.writeBuffer());
    await expect(parseSalesXlsx(buf)).rejects.toThrow(/Блюдо/);
  });
});

describe('dateFromFilename', () => {
  it('парсит дату из кривого имени iiko', () => {
    expect(dateFromFilename('()=>{...}_07.06.26.xlsx')).toBe('2026-06-07');
    expect(dateFromFilename('foo.xlsx')).toBeNull();
  });

  it('не принимает таймстамп выгрузки «cat_ГГГГММДД-ЧЧММСС» за дату продаж', () => {
    expect(dateFromFilename('cat_20260825-105027.xlsx')).toBeNull();
  });
});

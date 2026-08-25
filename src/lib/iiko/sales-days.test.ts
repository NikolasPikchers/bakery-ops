import { describe, it, expect } from 'vitest';
import { salesDaysFromFile } from './sales-days';
import type { ParsedSales } from './parse-sales-xlsx';

const parsed = (over: Partial<ParsedSales> = {}): ParsedSales => ({
  total: 1000,
  confectionery: 400,
  positions: 3,
  period: null,
  ...over,
});

describe('salesDaysFromFile', () => {
  it('берёт дату из имени файла, если периода в шапке нет (старая выгрузка)', () => {
    const r = salesDaysFromFile('()=>{...}_07.06.26.xlsx', parsed());
    expect(r).toEqual({
      ok: true,
      from: '2026-06-07',
      till: '2026-06-07',
      days: [{ date: '2026-06-07', amount: 1000, confectionery: 400 }],
    });
  });

  it('берёт период из шапки, игнорируя таймстамп в имени файла («Категории и блюда»)', () => {
    const r = salesDaysFromFile('cat_20260825-105027.xlsx', parsed({ period: { from: '2026-08-21', till: '2026-08-21' } }));
    expect(r).toEqual({
      ok: true,
      from: '2026-08-21',
      till: '2026-08-21',
      days: [{ date: '2026-08-21', amount: 1000, confectionery: 400 }],
    });
  });

  it('период из нескольких дней — делит сумму и кондитерку поровну', () => {
    const r = salesDaysFromFile('cat_20260825-105027.xlsx', parsed({ period: { from: '2026-08-21', till: '2026-08-23' } }));
    expect(r.ok && r.days).toEqual([
      { date: '2026-08-21', amount: 333.33, confectionery: 133.33 },
      { date: '2026-08-22', amount: 333.33, confectionery: 133.33 },
      { date: '2026-08-23', amount: 333.34, confectionery: 133.34 },
    ]);
  });

  it('период из шапки главнее даты в имени файла', () => {
    const r = salesDaysFromFile('отчёт_07.06.26.xlsx', parsed({ period: { from: '2026-08-21', till: '2026-08-21' } }));
    expect(r.ok && r.days[0].date).toBe('2026-08-21');
  });

  it('нет ни периода, ни даты в имени — ошибка', () => {
    expect(salesDaysFromFile('cat_20260825-105027.xlsx', parsed())).toEqual({
      ok: false,
      error: 'нет даты: ни периода в шапке, ни даты в имени файла',
    });
  });
});

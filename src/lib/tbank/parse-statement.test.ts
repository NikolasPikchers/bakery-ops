import { describe, it, expect } from 'vitest';
import { parseStatementCsv, parseAmount, toIsoDate } from './parse-statement';

describe('parseAmount', () => {
  it('запятая и пробелы, абсолютное значение', () => {
    expect(parseAmount('1 234,56')).toBeCloseTo(1234.56);
    expect(parseAmount('189,0')).toBe(189);
    expect(parseAmount('300')).toBe(300);
    expect(parseAmount('')).toBe(0);
  });
});

describe('toIsoDate', () => {
  it('ДД.ММ.ГГГГ → ISO', () => {
    expect(toIsoDate('13.02.2026')).toBe('2026-02-13');
    expect(toIsoDate('мусор')).toBe('');
  });
});

describe('parseStatementCsv', () => {
  const csv = [
    'Номер счёта;Тип операции (пополнение/списание);Дата проведения;Номер платежа;Сумма в валюте счёта;Назначение платежа;Описание операции;Наименование контрагента;ИНН контрагента',
    '40802;Дебет;15.02.2026;138132;"1 234,56";"Аренда; февраль";Оплата аренды;"ООО ""Ромашка""";7712345678',
    '40802;Кредит;16.02.2026;138133;189,0;Пополнение СБП;Пополнение по СБП;"АО ""ТБанк""";7710140679',
  ].join('\n');

  it('маппит строки, снимает BOM, разбирает кавычки/запятые/дату/направление', () => {
    const ops = parseStatementCsv('﻿' + csv);
    expect(ops).toHaveLength(2);
    expect(ops[0]).toEqual({
      id: '40802|138132|15.02.2026|1 234,56',
      date: '2026-02-15',
      amount: 1234.56,
      direction: 'out',
      counterparty: 'ООО "Ромашка"',
      inn: '7712345678',
      purpose: 'Аренда; февраль',
    });
    expect(ops[1].direction).toBe('in');
    expect(ops[1].counterparty).toBe('АО "ТБанк"');
  });

  it('бросает понятную ошибку при отсутствии нужной колонки', () => {
    expect(() => parseStatementCsv('A;B\n1;2')).toThrow(/нет колонки/);
  });
});

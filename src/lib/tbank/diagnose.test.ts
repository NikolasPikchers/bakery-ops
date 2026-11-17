import { describe, it, expect } from 'vitest';
import { csvCanonicalKey, diagnoseStatement, mask } from './diagnose';

const ACC = '40802810000000000001';

describe('csvCanonicalKey', () => {
  it('ключ из externalId файла-выписки: дата в ISO, сумма с копейками', () => {
    expect(csvCanonicalKey(`${ACC}|24108|31.10.2026|406,7`)).toBe(`${ACC}|24108|2026-10-31|406.70`);
    expect(csvCanonicalKey(`${ACC}|5|01.10.2026|1 020`)).toBe(`${ACC}|5|2026-10-01|1020.00`);
    expect(csvCanonicalKey('мусор')).toBeNull();
  });
});

describe('mask', () => {
  it('цифры → 9, буквы → a: формат без значения', () => {
    expect(mask('2026-10-31T12:00:00+03:00')).toBe('9999-99-99a99:99:99+99:99');
    expect(mask('ab12')).toBe('aa99');
  });
});

describe('diagnoseStatement', () => {
  const existing = [
    { externalId: `${ACC}|111|31.10.2026|406,7`, category: 'produkty' },
    { externalId: `${ACC}|222|30.10.2026|1000,0`, category: 'arenda' },
    { externalId: `${ACC}|333|29.10.2026|50,0`, category: 'prochee' },
  ];
  const ops = [
    { operationId: 'u1', documentNumber: '111', operationDate: '2026-10-31T10:00:00+03:00', typeOfOperation: 'Debit', accountAmount: 406.7, payPurpose: 'Отражение операции оплаты по карте', counterParty: { name: 'Магазин', inn: null } },
    { operationId: 'u2', documentNumber: '222', operationDate: '2026-10-30T09:00:00+03:00', typeOfOperation: 'Debit', accountAmount: 1000, payPurpose: 'Аренда за октябрь', counterParty: { name: 'ИП', inn: '1' } },
    { operationId: 'u3', documentNumber: '999', operationDate: '2026-10-30T09:00:00+03:00', typeOfOperation: 'Credit', accountAmount: 5000, payPurpose: 'Выручка', counterParty: null },
  ];

  it('находит, какие поля API дают ключи, совпадающие с выпиской-файлом', () => {
    const r = diagnoseStatement(ops, ACC, existing);
    expect(r.operations).toBe(3);
    expect(r.types).toEqual({ Debit: 2, Credit: 1 });
    expect(r.existingInWindow).toBe(3);
    expect(r.bestMatch).toMatchObject({ idField: 'documentNumber', dateField: 'operationDate', amountField: 'accountAmount', matched: 2 });
  });

  it('проверяет, совпадут ли категории при разных полях назначения', () => {
    const r = diagnoseStatement(ops, ACC, existing);
    const pp = r.categoryAgreement.find((c) => c.purposeField === 'payPurpose')!;
    expect(pp).toMatchObject({ agree: 2, of: 2 });
  });

  it('в отчёте нет сумм, имён и номеров — только поля, счётчики и маски', () => {
    const json = JSON.stringify(diagnoseStatement(ops, ACC, existing));
    expect(json).not.toContain('Магазин');
    expect(json).not.toContain('406.7');
    expect(json).not.toContain('Аренда');
    expect(json).not.toContain(ACC);
  });
});

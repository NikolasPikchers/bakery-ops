import { describe, it, expect } from 'vitest';
import { categorize, isImportableExpense } from './categorize';
import type { BankOperation } from './types';

const op = (over: Partial<BankOperation>): BankOperation => ({
  id: 'x', date: '2026-06-01', amount: 100, direction: 'out',
  counterparty: null, inn: null, purpose: null, ...over,
});

describe('isImportableExpense', () => {
  it('исключает приходы, переводы себе (по ИНН и по назначению)', () => {
    expect(isImportableExpense(op({ direction: 'in' }))).toBe(false);
    expect(isImportableExpense(op({ direction: 'out', inn: '524708272990' }))).toBe(false);
    expect(isImportableExpense(op({ direction: 'out', purpose: 'Перевод собственных средств на счет' }))).toBe(false);
    expect(isImportableExpense(op({ direction: 'out', purpose: 'Оплата поставщику' }))).toBe(true);
  });
});

describe('categorize', () => {
  it('категория по ИНН контрагента (поставщик продуктов)', () => {
    expect(categorize(op({ inn: '5258068806', purpose: 'НДС не облагается' })).category).toBe('produkty');
    expect(categorize(op({ inn: '524700117689', purpose: 'оплата' })).category).toBe('arenda');
  });
  it('покупка по бизнес-карте → продукты', () => {
    expect(categorize(op({ counterparty: 'АО "ТБанк"', purpose: 'Отражение операции оплаты по карте номер 2200 PYATEROCHKA' })).category).toBe('produkty');
  });
  it('аренда по ключевому слову', () => {
    expect(categorize(op({ purpose: 'Оплата по договору аренды помещения' })).category).toBe('arenda');
  });
  it('налоги: НДФЛ/ФНС/страховые/ОСФР', () => {
    expect(categorize(op({ purpose: 'Уплата НДФЛ за май' })).category).toBe('nalogi');
    expect(categorize(op({ counterparty: 'Казначейство России (ФНС)' })).category).toBe('nalogi');
    expect(categorize(op({ counterparty: 'ОСФР по Нижегородской области', purpose: 'взнос' })).category).toBe('nalogi');
  });
  it('ФОТ: зарплата/аванс', () => {
    expect(categorize(op({ purpose: 'Выплата заработной платы за май' })).category).toBe('fot');
  });
  it('коммуналка: электро/связь/уфанет', () => {
    expect(categorize(op({ purpose: 'Электроэнергия' })).category).toBe('kommunalka');
    expect(categorize(op({ counterparty: 'Уфанет', purpose: 'Оплата за услуги' })).category).toBe('kommunalka');
  });
  it('банковская комиссия → прочее без флага проверки', () => {
    const r = categorize(op({ purpose: 'Комиссия за операции по терминалам эквайринга', counterparty: 'АО "ТБанк"' }));
    expect(r.category).toBe('prochee');
    expect(r.needsReview).toBe(false);
  });
  it('неизвестное → прочее + needsReview', () => {
    const r = categorize(op({ purpose: 'Оплата по счету 1486', counterparty: 'ООО Партнёр' }));
    expect(r.category).toBe('prochee');
    expect(r.needsReview).toBe(true);
  });
});

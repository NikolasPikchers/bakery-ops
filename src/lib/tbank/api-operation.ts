import { moscowDate, type TbankRawOperation } from './client';
import { apiExternalId } from './expense-key';
import type { BankOperation } from './types';

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);

/**
 * Операция T-API → операция выписки. Соответствие полей сверено с файлом-выпиской на проде
 * (79 из 79 за 25–31.10.2026): documentNumber = «Номер платежа», operationDate = дата,
 * accountAmount = «Сумма в валюте счёта», payPurpose = «Назначение платежа» (категории совпали 79/79).
 */
export function toBankOperation(raw: TbankRawOperation, accountNumber: string): BankOperation {
  const date = raw.operationDate ? moscowDate(raw.operationDate) : '';
  const amount = Math.abs(Number(raw.accountAmount ?? raw.operationAmount ?? 0)) || 0;
  const number = text(raw.documentNumber) ?? text(raw.operationId) ?? '';
  return {
    id: apiExternalId(accountNumber, number, date, amount),
    date,
    amount,
    direction: String(raw.typeOfOperation).toLowerCase() === 'debit' ? 'out' : 'in',
    counterparty: text(raw.counterParty?.name),
    inn: text(raw.counterParty?.inn),
    purpose: text(raw.payPurpose) ?? text(raw.description),
    ...(typeof raw.category === 'string' && raw.category.startsWith('self') ? { selfTransfer: true } : {}),
  };
}

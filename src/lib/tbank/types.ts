// Нормализованные доменные типы T-API (не зависят от сырого формата банка).

export type BankAccount = {
  accountNumber: string;
  name?: string | null;
  currency?: string | null;
};

export type BankOperation = {
  id: string; // уникальный ID операции — ключ дедупа
  date: string; // ISO yyyy-mm-dd
  amount: number; // абсолютная сумма, ₽
  direction: 'in' | 'out';
  counterparty: string | null;
  inn: string | null;
  purpose: string | null; // назначение платежа
};

export type ImportSummary = {
  fetched: number; // всего операций получено
  outgoing: number; // из них исходящих (расходы)
  imported: number; // создано новых Expense
  updated: number; // обновлено существующих (идемпотентность)
};

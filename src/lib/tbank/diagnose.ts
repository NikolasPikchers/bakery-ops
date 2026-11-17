// Диагностика T-API без записи в базу: какие поля операции соответствуют колонкам
// выписки-файла («Номер платежа», «Дата проведения», «Сумма в валюте счёта»), по которым
// уже загружены расходы. Отчёт без значений: только имена полей, счётчики и маски форматов.
import { categorize } from './categorize';
import { moscowDate, type TbankRawOperation } from './client';
import { parseAmount, toIsoDate } from './parse-statement';
import type { BankOperation } from './types';

export type ExistingExpense = { externalId: string; category: string };

/** externalId из файла «счёт|номер|ДД.ММ.ГГГГ|сумма» → «счёт|номер|ГГГГ-ММ-ДД|сумма.00». */
export function csvCanonicalKey(externalId: string): string | null {
  const [acc, payno, date, amount] = externalId.split('|');
  if (!acc || payno === undefined || !date || amount === undefined) return null;
  const iso = toIsoDate(date);
  if (!iso) return null;
  return `${acc}|${payno}|${iso}|${parseAmount(amount).toFixed(2)}`;
}

/** Формат без значения: цифры → 9, буквы → a. */
export function mask(value: string): string {
  return value.replace(/\d/g, '9').replace(/[A-Za-zА-Яа-яЁё]/g, 'a');
}

const scalar = (v: unknown): string | null =>
  typeof v === 'string' && v.trim() ? v.trim() : typeof v === 'number' && Number.isFinite(v) ? String(v) : null;

const looksLikeDate = (v: string) => /^\d{4}-\d{2}-\d{2}/.test(v);

export type DiagnoseReport = ReturnType<typeof diagnoseStatement>;

export function diagnoseStatement(ops: TbankRawOperation[], accountNumber: string, existing: ExistingExpense[]) {
  const types: Record<string, number> = {};
  const keys: Record<string, number> = {};
  const counterPartyKeys: Record<string, number> = {};
  const masks: Record<string, Set<string>> = {};
  for (const op of ops) {
    const t = String(op.typeOfOperation ?? '?');
    types[t] = (types[t] ?? 0) + 1;
    for (const [k, v] of Object.entries(op)) {
      keys[k] = (keys[k] ?? 0) + 1;
      const s = scalar(v);
      if (s !== null) (masks[k] ??= new Set()).add(mask(s));
    }
    if (op.counterParty && typeof op.counterParty === 'object') {
      for (const k of Object.keys(op.counterParty)) counterPartyKeys[k] = (counterPartyKeys[k] ?? 0) + 1;
    }
  }

  const existingKeys = new Map<string, string>();
  for (const e of existing) {
    const k = csvCanonicalKey(e.externalId);
    if (k) existingKeys.set(k, e.category);
  }

  const debits = ops.filter((o) => String(o.typeOfOperation).toLowerCase() === 'debit');
  const scalarKeys = Object.keys(keys).filter((k) => debits.some((o) => scalar(o[k]) !== null));
  const dateKeys = scalarKeys.filter((k) => debits.some((o) => looksLikeDate(scalar(o[k]) ?? '')));
  const amountKeys = scalarKeys.filter((k) => /amount/i.test(k));
  const idKeys = scalarKeys.filter((k) => !dateKeys.includes(k) && !amountKeys.includes(k));

  const keyOf = (o: TbankRawOperation, idK: string, dateK: string, amtK: string): string | null => {
    const id = scalar(o[idK]);
    const date = scalar(o[dateK]);
    const amt = Number(o[amtK]);
    if (id === null || date === null || !Number.isFinite(amt)) return null;
    return `${accountNumber}|${id}|${moscowDate(date)}|${Math.abs(amt).toFixed(2)}`;
  };

  const combos: { idField: string; dateField: string; amountField: string; matched: number }[] = [];
  for (const idK of idKeys)
    for (const dateK of dateKeys)
      for (const amtK of amountKeys) {
        let matched = 0;
        for (const o of debits) {
          const k = keyOf(o, idK, dateK, amtK);
          if (k && existingKeys.has(k)) matched++;
        }
        combos.push({ idField: idK, dateField: dateK, amountField: amtK, matched });
      }
  combos.sort((a, b) => b.matched - a.matched);
  const best = combos[0] ?? null;

  const purposeFields = ['payPurpose', 'description'] as const;
  const variants: { purposeField: string; pick: (o: TbankRawOperation) => string | null }[] = [
    ...purposeFields.map((f) => ({ purposeField: f, pick: (o: TbankRawOperation) => scalar(o[f]) })),
    { purposeField: 'payPurpose||description', pick: (o) => scalar(o.payPurpose) ?? scalar(o.description) },
    { purposeField: 'description||payPurpose', pick: (o) => scalar(o.description) ?? scalar(o.payPurpose) },
  ];
  const categoryAgreement = variants.map(({ purposeField, pick }) => {
    let agree = 0;
    let of = 0;
    if (best) {
      for (const o of debits) {
        const k = keyOf(o, best.idField, best.dateField, best.amountField);
        const want = k ? existingKeys.get(k) : undefined;
        if (want === undefined) continue;
        of++;
        const op: BankOperation = {
          id: k!,
          date: '',
          amount: 0,
          direction: 'out',
          counterparty: scalar(o.counterParty?.name),
          inn: scalar(o.counterParty?.inn),
          purpose: pick(o),
        };
        if (categorize(op).category === want) agree++;
      }
    }
    return { purposeField, agree, of };
  });

  const unmatchedByBankCategory: Record<string, number> = {};
  if (best) {
    for (const o of debits) {
      const k = keyOf(o, best.idField, best.dateField, best.amountField);
      if (k && existingKeys.has(k)) continue;
      const c = String(o.category ?? '?');
      unmatchedByBankCategory[c] = (unmatchedByBankCategory[c] ?? 0) + 1;
    }
  }

  return {
    operations: ops.length,
    types,
    keys,
    counterPartyKeys,
    formats: Object.fromEntries(Object.entries(masks).map(([k, s]) => [k, [...s].slice(0, 4)])),
    existingInWindow: existingKeys.size,
    debits: debits.length,
    bestMatch: best,
    topCombos: combos.slice(0, 8),
    categoryAgreement,
    unmatchedByBankCategory,
  };
}

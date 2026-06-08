import type { ExpenseCategoryKey } from '@/lib/finance/categories';
import type { BankOperation } from './types';

// ИНН самой ИП — переводы себе на счёт (вывод средств), это не бизнес-расход.
export const OWNER_INNS: ReadonlySet<string> = new Set(['524708272990']);
const EXCLUDE_PURPOSE_WORDS = ['перевод собственных средств', 'собственных средств'];

/** Подлежит ли операция импорту как бизнес-расход (исходящая и не вывод средств себе). */
export function isImportableExpense(op: BankOperation): boolean {
  if (op.direction !== 'out') return false;
  if (op.inn && OWNER_INNS.has(op.inn)) return false;
  const p = (op.purpose ?? '').toLowerCase();
  return !EXCLUDE_PURPOSE_WORDS.some((w) => p.includes(w));
}

// Прямое сопоставление ИНН контрагента → категория (расширяется со временем).
export const CATEGORY_BY_INN: Readonly<Record<string, ExpenseCategoryKey>> = {
  '5258068806': 'produkty', // ООО «СВИТ ЛАЙФ ФУДСЕРВИС» — поставщик продуктов
  '1800031056': 'investicii', // ООО «ЯНС-ХОРЕКА» — оборудование/HoReCa (инвестиции)
  '7734523776': 'produkty', // АО «ОПТИКОМ» — поставщик
  '524700117689': 'arenda', // ИП Сулейманов — аренда
  '0278109628': 'kommunalka', // Уфанет — интернет
};

type Rule = { cat: Exclude<ExpenseCategoryKey, 'produkty'>; words: string[] };

// Порядок важен: первое совпадение выигрывает.
const RULES: Rule[] = [
  { cat: 'arenda', words: ['аренд'] },
  { cat: 'nalogi', words: ['налог', 'ндфл', 'страхов', 'фнс', 'казначейств', 'осфр', 'сфр', 'взнос', 'пени'] },
  { cat: 'fot', words: ['зарплат', 'заработн', 'аванс', 'фот', 'оплата труда'] },
  { cat: 'kommunalka', words: ['электро', 'энерго', 'водоснаб', 'водоотвед', 'тепло', 'коммунал', 'связь', 'интернет', 'телефон', 'уфанет'] },
];

// Покупки по бизнес-карте (магазины) — в основном закупка продуктов/расходников.
const CARD_PURCHASE_WORDS = ['отражение операции оплаты', 'оплаты по карте'];
// Банковские/эквайринговые комиссии и сервисные платежи → «Прочее» без флага проверки.
const FEE_WORDS = ['комисси', 'плата за', 'обслуживание', 'эквайр', 'возврат', 'абонент'];

export function categorize(op: BankOperation): { category: ExpenseCategoryKey; needsReview: boolean } {
  if (op.inn && CATEGORY_BY_INN[op.inn]) return { category: CATEGORY_BY_INN[op.inn], needsReview: false };
  const hay = `${op.purpose ?? ''} ${op.counterparty ?? ''}`.toLowerCase();
  if (CARD_PURCHASE_WORDS.some((w) => hay.includes(w))) return { category: 'produkty', needsReview: false };
  for (const r of RULES) {
    if (r.words.some((w) => hay.includes(w))) return { category: r.cat, needsReview: false };
  }
  if (FEE_WORDS.some((w) => hay.includes(w))) return { category: 'prochee', needsReview: false };
  return { category: 'prochee', needsReview: true };
}

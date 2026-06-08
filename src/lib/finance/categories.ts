export const EXPENSE_CATEGORIES = [
  { key: 'produkty', label: 'Продукты' },
  { key: 'arenda', label: 'Аренда' },
  { key: 'fot', label: 'ФОТ' },
  { key: 'kommunalka', label: 'Коммуналка' },
  { key: 'nalogi', label: 'Налоги' },
  { key: 'investicii', label: 'Инвестиции' },
  { key: 'prochee', label: 'Прочее' },
] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number]['key'];

export const EXPENSE_CATEGORY_KEYS = EXPENSE_CATEGORIES.map((c) => c.key) as [
  ExpenseCategoryKey,
  ...ExpenseCategoryKey[],
];

export function categoryLabel(key: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

/** Резолвит категорию по ключу ('arenda') или рус. метке ('Аренда'), регистронезависимо. */
export function categoryFromInput(s: string): ExpenseCategoryKey | null {
  const t = s.trim().toLowerCase();
  const c = EXPENSE_CATEGORIES.find(
    (x) => x.key.toLowerCase() === t || x.label.toLowerCase() === t,
  );
  return c ? c.key : null;
}

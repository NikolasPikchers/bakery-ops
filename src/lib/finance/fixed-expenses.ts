import { monthDays as monthDaysOf } from './month';
import type { ExpenseCategoryKey } from './categories';

/**
 * Фиксированные ежемесячные расходы, которые НЕ берём из выписки, а считаем
 * равномерно размазанными по дням месяца (как фикс-оклад водителя).
 * Категории отсюда на дашборде заменяют фактические проводки из выписки
 * (их там игнорируем, чтобы не задвоить). Только Плюшкино.
 */
export type FixedExpense = { category: ExpenseCategoryKey; monthly: number };

export const FIXED_EXPENSES: FixedExpense[] = [
  { category: 'arenda', monthly: 77000 }, // аренда (ИП Сулейманов) — 77к/мес
  { category: 'kommunalka', monthly: 48000 }, // коммуналка (свет/вода/тепло, нал мимо Т-Бизнес) — 48к/мес
];

/** Категории, полностью покрытые фиксом → фактические расходы по ним на дашборде игнорируем. */
export const FIXED_EXPENSE_CATEGORIES: ReadonlySet<string> = new Set(FIXED_EXPENSES.map((f) => f.category));

/**
 * Доля месячной суммы пропорционально числу учтённых дней месяца.
 * Полный месяц (upTo не задан или ≥ конца) → ровно monthly; «по сегодня» → пропорция.
 */
export function proratedMonthly(monthly: number, month: string, upTo?: string): number {
  const days = monthDaysOf(month);
  if (days.length === 0) return 0;
  const counted = upTo ? days.filter((d) => d <= upTo).length : days.length;
  return Math.round((monthly * counted) / days.length);
}

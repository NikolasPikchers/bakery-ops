// Цвета фона ✓ в табеле по размеру премии (пекари/кассир).
export const BONUS_LEVELS = [
  { amount: 100, color: '#38bdf8', label: 'голубой' },
  { amount: 300, color: '#22c55e', label: 'зелёный' },
  { amount: 500, color: '#9b59b6', label: 'фиолетовый' },
  { amount: 800, color: '#c0392b', label: 'красный' },
  { amount: 1000, color: '#f59e0b', label: 'оранжевый' },
  { amount: 1200, color: '#1f2a25', label: 'чёрный' },
] as const;

/** Цвет фона по сумме премии (точное совпадение тарифа), иначе null. */
export function bonusColor(bonus: number): string | null {
  return BONUS_LEVELS.find((l) => l.amount === bonus)?.color ?? null;
}

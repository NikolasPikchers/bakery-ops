/** Сумма в рублях: знак и до двух знаков копеек, без округления неверного ввода. */
export function parseAdjustmentAmount(value: string): number | null {
  const text = value.trim();
  if (!/^[+-]?\d{1,8}(?:[.,]\d{1,2})?$/.test(text)) return null;
  return Number(text.replace(',', '.'));
}

export const formatRub = (value: number) => {
  const rounded = Math.round(value * 100) / 100;
  return rounded.toLocaleString('ru-RU', { minimumFractionDigits: Number.isInteger(rounded) ? 0 : 2, maximumFractionDigits: 2 });
};
export const signedRub = (value: number) => `${value > 0 ? '+' : ''}${formatRub(value)}`;

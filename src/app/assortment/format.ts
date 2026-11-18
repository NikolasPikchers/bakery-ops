/** Форматы страницы «Ассортимент» (ru-RU: пробел-разделитель тысяч, запятая в дробях). */
export const money = (n: number) => Math.round(n).toLocaleString('ru-RU');
export const percent = (n: number) => `${n.toLocaleString('ru-RU', { maximumFractionDigits: 2 })}%`;
export const qty = (n: number) => n.toLocaleString('ru-RU', { maximumFractionDigits: 1 });
export const ddmm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
export const ddmmyyyy = (iso: string) => `${ddmm(iso)}.${iso.slice(0, 4)}`;

/** 1 позиция, 2 позиции, 5 позиций. */
export function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10;
  const m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

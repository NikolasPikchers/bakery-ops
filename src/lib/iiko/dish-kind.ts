/** Кондитерка в меню iiko Плюшкино — блюда с префиксом «\» (пироги — «//», напитки — без префикса). */
export function isConfectionery(dishName: string): boolean {
  return dishName.startsWith('\\');
}

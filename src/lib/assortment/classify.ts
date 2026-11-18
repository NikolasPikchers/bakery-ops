/** Категории линейки Плюшкино — для фильтра на странице «Ассортимент». */
export type DishCategory = 'savory' | 'sweet' | 'confectionery' | 'drinks' | 'order' | 'other';

export const CATEGORY_LABEL: Record<DishCategory, string> = {
  savory: 'Сытное',
  sweet: 'Сладкая выпечка',
  confectionery: 'Кондитерка',
  drinks: 'Напитки',
  order: 'Под заказ',
  other: 'Прочее',
};

const GROUP_CATEGORY: Record<string, DishCategory> = {
  'Сытная мелкоштучка': 'savory',
  'Сладкая мелкоштучка': 'sweet',
  'Кофе, чай, напитки, фри': 'drinks',
  ЛПЗ: 'drinks',
  'Заказные пироги': 'order',
};

/** Префикс имени важнее группы iiko: «\» — кондитерка (как в `isConfectionery`), «//» — сытное. */
export function dishCategory(name: string, group: string | null): DishCategory {
  const n = name.trimStart();
  if (n.startsWith('\\')) return 'confectionery';
  if (n.startsWith('//')) return 'savory';
  return (group && GROUP_CATEGORY[group]) || 'other';
}

const SERVICE = /пакет|стаканчик|упаковка|доп\.|сироп|соус/i;

/** Пакеты, стаканчики, допы к кофе — продаются через кассу, но это не позиции линейки. */
export function isServiceDish(name: string): boolean {
  return SERVICE.test(name);
}

/** Имя для таблицы — без префикса категории («//», «\»). */
export function displayName(name: string): string {
  return name.replace(/^\s*(\/\/|\\)?\s*/, '');
}

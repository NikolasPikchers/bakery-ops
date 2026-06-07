/** Результат разбора одной рукописной ячейки количества. */
export type ParsedQuantity = {
  /** Итоговое числовое значение; null = ячейка не заполнена. */
  value: number | null;
  /** Исходный текст ячейки (никогда не теряем). */
  raw: string;
  /** Найденные числовые операнды, напр. [24, 12, 6]. */
  parts: number[];
  /** true, если требуется ручная проверка (мусор, единицы, несходящийся «=итог»). */
  ambiguous: boolean;
};

/** Тип листа (печатные шаблоны и свободная рукопись). */
export type SheetType = 'pies' | 'desserts' | 'confectionery_freeform';

/** На каких точках встречается позиция. */
export type PointScope = 'both' | 'point1' | 'point2';

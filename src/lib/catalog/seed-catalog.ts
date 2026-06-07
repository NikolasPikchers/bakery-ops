import type { SheetType, PointScope } from '@/lib/domain/types';

export type SeedProduct = {
  name: string;
  sheetType: SheetType;
  pointScope: PointScope;
  shelfLifeDays?: number;
  aliases?: string[];
};

export const SEED_CATALOG: SeedProduct[] = [
  // --- Пироги / выпечка (Точка 1) ---
  { name: 'Самса', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Перемяч', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Беляш татарский', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пирожок зел лук и яйцо', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пирожок с картошкой', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пирожок с капустой', sheetType: 'pies', pointScope: 'point1', aliases: ['Пирожок (беккен) с капустой'] },
  { name: 'Пирожок с печенью', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пицца закрытая', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пицца барбекю', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пицца открытая', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пицца сырная', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пицца куриная', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Сосиска в тесте', sheetType: 'pies', pointScope: 'point1', aliases: ['Сосиска в тексе'] },
  { name: 'Хачапури', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Хот-дог', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Ватрушка', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Творожники', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Кекс домашний', sheetType: 'pies', pointScope: 'point1' },

  // --- Десерты (обе точки), срок годности → aging ---
  { name: 'Манго Маракуйя', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Клубничное облако', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Каскейл Сникерс', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Красный бархат', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Медовик Карамель', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Чизкейк клубничный', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5, aliases: ['Чизкейл клубничный'] },
  { name: 'Бенто Орео', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Зимняя вишня', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Эстерхази', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Тарт', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
];

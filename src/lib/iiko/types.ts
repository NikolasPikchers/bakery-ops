export type IikoOrg = { id: string; name: string };
/** Выручка за учётный день iiko, ₽ после скидок; confectionery — её часть по кондитерке. */
export type DailyRevenue = { date: string; amount: number; confectionery: number };
export type RevenueImportSummary = { days: number; imported: number; updated: number };
/** Продажи позиции за учётный день iiko: штуки, ₽ после скидок, себестоимость (0 — не заполнена), чеки. */
export type DishSaleDay = {
  date: string;
  dishId: string;
  name: string;
  dishGroup: string | null;
  qty: number;
  revenue: number;
  cost: number;
  /** Чеков с этой позицией. */
  checks: number;
  /** Чеков, где кроме неё только служебное (пакет и т. п.). */
  soloChecks: number;
};

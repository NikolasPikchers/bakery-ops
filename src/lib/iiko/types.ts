export type IikoOrg = { id: string; name: string };
/** Выручка за учётный день iiko, ₽ после скидок; confectionery — её часть по кондитерке. */
export type DailyRevenue = { date: string; amount: number; confectionery: number };
export type RevenueImportSummary = { days: number; imported: number; updated: number };

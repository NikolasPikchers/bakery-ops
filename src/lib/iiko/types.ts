export type IikoOrg = { id: string; name: string };
export type DailyRevenue = { date: string; amount: number }; // ISO день, ₽ (нетто после скидок)
export type RevenueImportSummary = { days: number; imported: number; updated: number };

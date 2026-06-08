import { computeAging } from '@/lib/domain/aging';

export type MovementRow = {
  pointId: string;
  pointName: string;
  productId: string;
  productName: string;
  sheetType: string;
  date: string; // ISO yyyy-mm-dd
  prihod: number | null;
  ostatok: number | null;
  spisanie: number | null;
  shelfLifeDays: number | null;
};

export type OstatokRow = { productName: string; pointName: string; ostatok: number };
export type SpisanieRow = { productName: string; pointName: string; total: number };
export type AgingRow = { productName: string; ageDays: number | null; ostatok: number; stale: boolean };

function groupByProductPoint(rows: MovementRow[]): Map<string, MovementRow[]> {
  const m = new Map<string, MovementRow[]>();
  for (const r of rows) {
    const k = `${r.pointId}|${r.productId}`;
    const list = m.get(k) ?? [];
    list.push(r);
    m.set(k, list);
  }
  return m;
}

/** Текущий остаток = остаток последней даты с заполненным остатком, по каждому товару/точке. */
export function currentOstatki(rows: MovementRow[]): OstatokRow[] {
  const out: OstatokRow[] = [];
  for (const list of groupByProductPoint(rows).values()) {
    const desc = [...list].sort((a, b) => b.date.localeCompare(a.date));
    const latest = desc.find((r) => r.ostatok != null);
    if (latest && latest.ostatok != null) {
      out.push({ productName: latest.productName, pointName: latest.pointName, ostatok: latest.ostatok });
    }
  }
  return out.sort((a, b) => a.productName.localeCompare(b.productName));
}

/** Сумма списаний за период [start, end) по товару/точке, по убыванию, без нулей. */
export function topSpisaniya(rows: MovementRow[], start: string, end: string): SpisanieRow[] {
  const m = new Map<string, SpisanieRow>();
  for (const r of rows) {
    if (r.date < start || r.date >= end) continue;
    const k = `${r.pointId}|${r.productId}`;
    const cur = m.get(k) ?? { productName: r.productName, pointName: r.pointName, total: 0 };
    cur.total += r.spisanie ?? 0;
    m.set(k, cur);
  }
  return [...m.values()].filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
}

/** Aging для десертов Корицы (point-2, sheetType desserts): возраст остатка vs shelfLifeDays. */
export function agingDesserts(rows: MovementRow[], asOf: string): AgingRow[] {
  const desserts = rows.filter((r) => r.pointId === 'point-2' && r.sheetType === 'desserts');
  const out: AgingRow[] = [];
  for (const list of groupByProductPoint(desserts).values()) {
    const shelf = list.find((r) => r.shelfLifeDays != null)?.shelfLifeDays ?? 5;
    const history = list.map((r) => ({ date: r.date, prihod: r.prihod, ostatok: r.ostatok }));
    const a = computeAging(history, asOf, shelf);
    if (a.currentOstatok != null && a.currentOstatok > 0) {
      out.push({ productName: list[0].productName, ageDays: a.ageDays, ostatok: a.currentOstatok, stale: a.stale });
    }
  }
  return out.sort((a, b) => Number(b.stale) - Number(a.stale) || (b.ageDays ?? 0) - (a.ageDays ?? 0));
}

export type MovementPoint = {
  date: string; // ISO yyyy-mm-dd
  prihod: number | null;
  ostatok: number | null;
};

export type AgingResult = {
  currentOstatok: number | null;
  lastPrihodDate: string | null;
  ageDays: number | null;
  stale: boolean;
};

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export function computeAging(
  history: MovementPoint[],
  asOf: string,
  shelfLifeDays = 5,
): AgingResult {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const lastWithOstatok = [...sorted].reverse().find((m) => m.ostatok != null);
  const currentOstatok = lastWithOstatok?.ostatok ?? null;

  if (currentOstatok == null || currentOstatok <= 0) {
    return { currentOstatok, lastPrihodDate: null, ageDays: null, stale: false };
  }

  const lastPrihod = [...sorted].reverse().find((m) => (m.prihod ?? 0) > 0) ?? null;
  const lastPrihodDate = lastPrihod?.date ?? null;
  const baseDate = lastPrihodDate ?? sorted[0]?.date ?? null;
  const ageDays = baseDate ? daysBetween(baseDate, asOf) : null;
  const stale = ageDays != null && ageDays > shelfLifeDays;

  return { currentOstatok, lastPrihodDate, ageDays, stale };
}

import { computeSold } from '@/lib/domain/computeSold';
import type { MovementRecord } from '@/lib/persistence/recognition-to-records';

export type PrevOstatokLookup = (
  pointId: string,
  productId: string,
  beforeDate: string,
) => Promise<number | null>;

export async function backfillCrossSheetSold(
  movements: MovementRecord[],
  lookup: PrevOstatokLookup,
): Promise<MovementRecord[]> {
  const earliestIdxByKey = new Map<string, number>();
  movements.forEach((m, i) => {
    const key = `${m.pointId}::${m.productId}`;
    const cur = earliestIdxByKey.get(key);
    if (cur === undefined || m.date < movements[cur].date) earliestIdxByKey.set(key, i);
  });

  const result = movements.map((m) => ({ ...m }));
  for (const idx of earliestIdxByKey.values()) {
    const m = result[idx];
    if (m.soldCalc !== null) continue;
    const prev = await lookup(m.pointId, m.productId, m.date);
    if (prev === null) continue;
    const { sold } = computeSold({
      prevOstatok: prev,
      prihod: m.prihod,
      spisanie: m.spisanie,
      ostatok: m.ostatok,
    });
    result[idx] = { ...m, soldCalc: sold };
  }
  return result;
}

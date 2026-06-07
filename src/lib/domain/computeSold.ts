export type SoldResult = {
  sold: number | null;
  reason?: 'no-base';
  anomaly?: boolean;
};

export function computeSold(args: {
  prevOstatok: number | null;
  prihod: number | null;
  spisanie: number | null;
  ostatok: number | null;
}): SoldResult {
  const { prevOstatok, prihod, spisanie, ostatok } = args;
  if (prevOstatok == null || ostatok == null) {
    return { sold: null, reason: 'no-base' };
  }
  const sold = prevOstatok + (prihod ?? 0) - (spisanie ?? 0) - ostatok;
  if (sold < 0) return { sold, anomaly: true };
  return { sold };
}

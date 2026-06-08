const BAKER: ReadonlyArray<readonly [number, number]> = [
  [42000, 1200], [36000, 1000], [31000, 800], [26000, 500], [23000, 300], [22000, 100],
];
const CASHIER_TOTAL: ReadonlyArray<readonly [number, number]> = [
  [71000, 1200], [66000, 1000], [61000, 800], [56000, 500], [51000, 300],
];

/** Премия пекаря от выручки «пироги+прочее» за день. */
export function bakerBonus(pies: number): number {
  for (const [th, b] of BAKER) if (pies >= th) return b;
  return 0;
}

/** Премия кассира: ступени от общей выручки; нижняя 100, если пироги+прочее ≥ 22к. */
export function cashierBonus(total: number, pies: number): number {
  for (const [th, b] of CASHIER_TOTAL) if (total >= th) return b;
  return pies >= 22000 ? 100 : 0;
}

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
  // currentOstatok и lastPrihodDate берутся из последних НЕпустых строк независимо:
  // если в самой свежей строке остаток не записан, берём последний известный остаток,
  // а дату прихода — последнюю с приходом > 0 (это может быть другая строка — так и задумано:
  // используем лучшие доступные данные при нерегулярном заполнении).
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const desc = [...sorted].reverse();
  const currentOstatok = desc.find((m) => m.ostatok != null)?.ostatok ?? null;

  if (currentOstatok == null || currentOstatok <= 0) {
    return { currentOstatok, lastPrihodDate: null, ageDays: null, stale: false };
  }

  // Возраст определён только относительно последнего прихода (спека §9).
  // Нет прихода в истории → возраст неизвестен, ничего не флагуем (без ложных алертов).
  const lastPrihodDate = desc.find((m) => (m.prihod ?? 0) > 0)?.date ?? null;
  if (lastPrihodDate == null) {
    return { currentOstatok, lastPrihodDate: null, ageDays: null, stale: false };
  }

  const ageDays = daysBetween(lastPrihodDate, asOf);
  const stale = ageDays > shelfLifeDays;

  return { currentOstatok, lastPrihodDate, ageDays, stale };
}

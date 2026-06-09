export type SchedEmployee = {
  role: 'baker' | 'cashier' | 'kitchen' | 'confectioner';
  group: 'bakery' | 'confectionery';
  brigade: string | null;
  schedOffset: number;
};

// Опора графика кондитеров: 08.06 — день 0 цикла 2/2 (Лена), сдвиги — Оксана/Лариса.
export const ANCHOR = '2026-06-08';
// Опора графика пекарни (2/2 по бригадам): задаёт фазу A↔B.
// 07.06 — начало блока бригады A ⇒ A: 07-08, B: 09-10, A: 11-12, B: 13-14 …
export const BAKERY_ANCHOR = '2026-06-07';

const toUTC = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const mod = (n: number, m: number) => ((n % m) + m) % m;
const daysBetween = (anchor: string, iso: string): number => Math.round((toUTC(iso) - toUTC(anchor)) / 86400000);

/** Плановый выход сотрудника на дату (без учёта ручных правок). */
export function autoPresent(emp: SchedEmployee, iso: string): boolean {
  if (emp.role === 'kitchen') {
    const wd = new Date(toUTC(iso)).getUTCDay();
    return wd >= 1 && wd <= 5;
  }
  if (emp.group === 'confectionery') {
    return mod(daysBetween(ANCHOR, iso) - emp.schedOffset, 4) <= 1;
  }
  // пекарня: бригады A/B, 2/2 (опора BAKERY_ANCHOR)
  const cyclePos = mod(Math.floor(daysBetween(BAKERY_ANCHOR, iso) / 2), 2); // 0 → A, 1 → B
  return (emp.brigade === 'A' && cyclePos === 0) || (emp.brigade === 'B' && cyclePos === 1);
}

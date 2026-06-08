export type SchedEmployee = {
  role: 'baker' | 'cashier' | 'kitchen' | 'confectioner';
  group: 'bakery' | 'confectionery';
  brigade: string | null;
  schedOffset: number;
};

export const ANCHOR = '2026-06-08';

const toUTC = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const mod = (n: number, m: number) => ((n % m) + m) % m;
const daysFromAnchor = (iso: string): number => Math.round((toUTC(iso) - toUTC(ANCHOR)) / 86400000);

/** Плановый выход сотрудника на дату (без учёта ручных правок). */
export function autoPresent(emp: SchedEmployee, iso: string): boolean {
  if (emp.role === 'kitchen') {
    const wd = new Date(toUTC(iso)).getUTCDay();
    return wd >= 1 && wd <= 5;
  }
  if (emp.group === 'confectionery') {
    return mod(daysFromAnchor(iso) - emp.schedOffset, 4) <= 1;
  }
  // пекарня: бригады A/B, 2/2
  const cyclePos = mod(Math.floor(daysFromAnchor(iso) / 2), 2); // 0 → A, 1 → B
  return (emp.brigade === 'A' && cyclePos === 0) || (emp.brigade === 'B' && cyclePos === 1);
}

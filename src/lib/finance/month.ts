const RU_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const pad = (n: number) => String(n).padStart(2, '0');

export function currentMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

function parse(month: string): { y: number; m: number } {
  const [y, m] = month.split('-').map(Number);
  return { y, m };
}

export function monthRange(month: string): { start: string; end: string } {
  const { y, m } = parse(month);
  const start = `${y}-${pad(m)}-01`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { start, end: `${ny}-${pad(nm)}-01` };
}

export function prevMonth(month: string): string {
  const { y, m } = parse(month);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

export function nextMonth(month: string): string {
  const { y, m } = parse(month);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

export function monthDays(month: string): string[] {
  const { y, m } = parse(month);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return Array.from({ length: count }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
}

export function monthLabel(month: string): string {
  const { y, m } = parse(month);
  return `${RU_MONTHS[m - 1]} ${y}`;
}

/** n месяцев, заканчивая на `month` (от старого к новому). monthsBack('2026-06',6)→['2026-01'..'2026-06']. */
export function monthsBack(month: string, n: number): string[] {
  const out = [month];
  for (let i = 1; i < n; i++) out.unshift(prevMonth(out[0]));
  return out;
}

/** Короткая ru-метка месяца: 'Июн'. */
export function monthShort(month: string): string {
  const { m } = parse(month);
  return RU_MONTHS[m - 1].slice(0, 3);
}

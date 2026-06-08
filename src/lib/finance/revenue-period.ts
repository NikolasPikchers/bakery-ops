/** Дни диапазона [from, to] включительно (ISO yyyy-mm-dd). [] если диапазон невалиден. */
export function enumerateDays(from: string, to: string): string[] {
  const start = new Date(`${from}T00:00:00.000Z`);
  const end = new Date(`${to}T00:00:00.000Z`);
  if (Number.isNaN(+start) || Number.isNaN(+end) || end < start) return [];
  const out: string[] = [];
  for (const d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

/** Делит сумму поровну по дням периода; остаток округления — на последний день (Σ == amount). */
export function splitRevenueByDays(from: string, to: string, amount: number): { date: string; amount: number }[] {
  const days = enumerateDays(from, to);
  if (days.length === 0) return [];
  const per = Math.round((amount / days.length) * 100) / 100;
  const out = days.map((date) => ({ date, amount: per }));
  const diff = Math.round((amount - per * days.length) * 100) / 100;
  if (diff !== 0) out[out.length - 1].amount = Math.round((per + diff) * 100) / 100;
  return out;
}

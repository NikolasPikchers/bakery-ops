import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { splitRevenueByDays } from '@/lib/finance/revenue-period';
import { upsertImportedRevenue } from '@/lib/db/revenue-import-repo';

export const runtime = 'nodejs';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json().catch(() => ({}));
  const pointId = body.pointId === 'point-1' ? 'point-1' : 'point-2'; // по умолчанию Корица
  const from = String(body.from ?? '');
  const to = String(body.to ?? '') || from;
  const amount = Number(body.amount);

  if (!ISO.test(from) || !ISO.test(to)) return Response.json({ error: 'Неверная дата' }, { status: 400 });
  if (!(amount > 0)) return Response.json({ error: 'Сумма должна быть > 0' }, { status: 400 });
  const days = splitRevenueByDays(from, to, amount);
  if (days.length === 0) return Response.json({ error: 'Дата «по» раньше «с»' }, { status: 400 });

  const prisma = getPrisma();
  let imported = 0;
  let updated = 0;
  for (const d of days) {
    const r = await upsertImportedRevenue(prisma, { pointId, date: d.date, amount: d.amount, source: 'manual' });
    if (r === 'imported') imported++;
    else updated++;
  }
  return Response.json({ imported, updated, days: days.length, perDay: days.length > 1 ? Math.round((amount / days.length) * 100) / 100 : undefined });
}

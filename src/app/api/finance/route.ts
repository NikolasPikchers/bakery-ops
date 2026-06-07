import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { parseFinanceEntry } from '@/lib/finance/finance-input';
import { upsertRevenue, createExpense, listFinanceEntries } from '@/lib/db/finance-repo';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const entries = await listFinanceEntries(getPrisma(), 50);
  return Response.json({ entries });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseFinanceEntry(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const prisma = getPrisma();
  const createdBy = session.user?.name ?? null;
  const v = parsed.value;
  if (v.type === 'revenue') {
    await upsertRevenue(prisma, { pointId: v.pointId, date: v.date, amount: v.amount, source: 'manual', note: v.note ?? null, createdBy });
  } else {
    await createExpense(prisma, { pointId: v.pointId, date: v.date, amount: v.amount, category: v.category, source: 'manual', note: v.note ?? null, createdBy });
  }
  return Response.json({ ok: true });
}

import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { parseRevenueCsv, parseExpenseCsv } from '@/lib/finance/finance-csv';
import { upsertRevenue, createExpense } from '@/lib/db/finance-repo';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const type = form.get('type');
  const fileEntry = form.get('file');
  const file = fileEntry instanceof File ? fileEntry : null;
  if (type !== 'revenue' && type !== 'expense') return Response.json({ error: 'type должен быть revenue|expense' }, { status: 400 });
  if (!file) return Response.json({ error: 'Нет файла' }, { status: 400 });

  const text = await file.text();
  const prisma = getPrisma();
  const createdBy = session.user?.name ?? null;

  if (type === 'revenue') {
    const { rows, errors } = parseRevenueCsv(text);
    for (const r of rows) await upsertRevenue(prisma, { ...r, source: 'import', note: r.note ?? null, createdBy });
    return Response.json({ imported: rows.length, errors });
  } else {
    const { rows, errors } = parseExpenseCsv(text);
    for (const r of rows) await createExpense(prisma, { ...r, source: 'import', note: r.note ?? null, createdBy });
    return Response.json({ imported: rows.length, errors });
  }
}

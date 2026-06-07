import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { deleteRevenue, deleteExpense } from '@/lib/db/finance-repo';

export const runtime = 'nodejs';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const type = new URL(req.url).searchParams.get('type');
  const prisma = getPrisma();
  if (type === 'revenue') await deleteRevenue(prisma, id);
  else if (type === 'expense') await deleteExpense(prisma, id);
  else return Response.json({ error: 'Укажите ?type=revenue|expense' }, { status: 400 });
  return Response.json({ ok: true });
}

import { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { deleteRevenue, deleteExpense } from '@/lib/db/finance-repo';

export const runtime = 'nodejs';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const type = new URL(req.url).searchParams.get('type');
  if (type !== 'revenue' && type !== 'expense') {
    return Response.json({ error: 'Укажите ?type=revenue|expense' }, { status: 400 });
  }

  const prisma = getPrisma();
  try {
    if (type === 'revenue') await deleteRevenue(prisma, id);
    else await deleteExpense(prisma, id);
  } catch (e) {
    // P2025 — записи нет (двойное удаление/неверный type); отдаём 404, а не 500 со стектрейсом Prisma.
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return Response.json({ error: 'Запись не найдена' }, { status: 404 });
    }
    throw e;
  }
  return Response.json({ ok: true });
}

import { Prisma } from '@prisma/client';
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { deleteRevenue, deleteExpense, updateExpenseCategory } from '@/lib/db/finance-repo';
import { categoryFromInput } from '@/lib/finance/categories';

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

/** Смена категории расхода (вкладка «Расходы»). Body: { category }. */
export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { category?: string };
  const category = categoryFromInput(body.category ?? '');
  if (!category) return Response.json({ error: 'Неизвестная категория' }, { status: 400 });

  const prisma = getPrisma();
  try {
    await updateExpenseCategory(prisma, id, category);
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2025') {
      return Response.json({ error: 'Расход не найден' }, { status: 404 });
    }
    throw e;
  }
  return Response.json({ ok: true, category });
}

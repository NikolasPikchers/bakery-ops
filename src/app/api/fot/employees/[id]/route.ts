import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { requireOwner } from '@/lib/auth/require-owner';
import { getPrisma } from '@/lib/db/client';
import { renameEmployee } from '@/lib/db/employee-repo';
import { isValidEmployeeName, normalizeEmployeeName } from '@/lib/fot/employee-name';

export const runtime = 'nodejs';

const input = z.object({ name: z.string().max(200).refine(isValidEmployeeName).transform(normalizeEmployeeName) }).strict();

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await requireOwner();
  if (session instanceof Response) return session;
  const { id } = await ctx.params;
  const parsed = input.safeParse(await req.json().catch(() => null));
  if (!id || id.length > 100 || !parsed.success) return Response.json({ error: 'Введите имя от 1 до 100 символов.' }, { status: 400 });
  try {
    const employee = await renameEmployee(getPrisma(), id, parsed.data.name);
    return Response.json({ employee });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') return Response.json({ error: 'Сотрудник с таким именем уже есть в этой группе. Добавьте фамилию.' }, { status: 409 });
      if (error.code === 'P2025') return Response.json({ error: 'Сотрудник не найден.' }, { status: 404 });
    }
    return Response.json({ error: 'Не удалось сохранить имя. Попробуйте ещё раз.' }, { status: 500 });
  }
}

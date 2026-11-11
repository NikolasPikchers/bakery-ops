import { requireOwner } from '@/lib/auth/require-owner';
import { getPrisma } from '@/lib/db/client';
import { setPayrollAdjustment } from '@/lib/db/fot-repo';
import { payrollAdjustmentSchema } from '@/lib/fot/adjustment-input';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const session = await requireOwner();
  if (session instanceof Response) return session;
  const parsed = payrollAdjustmentSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: 'Проверьте сотрудника, дату и сумму. Сумма — число со знаком и не более чем двумя знаками после запятой; комментарий — до 300 символов.' }, { status: 400 });
  try {
    const prisma = getPrisma();
    const employee = await prisma.employee.findFirst({ where: { id: parsed.data.employeeId, active: true }, select: { id: true } });
    if (!employee) return Response.json({ error: 'Сотрудник не найден' }, { status: 404 });
    await setPayrollAdjustment(prisma, parsed.data);
    return Response.json({ ok: true });
  } catch {
    return Response.json({ error: 'Не удалось сохранить изменения. Попробуйте ещё раз.' }, { status: 500 });
  }
}

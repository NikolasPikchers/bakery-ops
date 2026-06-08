import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { setAttendance } from '@/lib/db/fot-repo';

export const runtime = 'nodejs';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const employeeId = String(body.employeeId ?? '');
  const date = String(body.date ?? '');
  const present = Boolean(body.present);
  if (!employeeId || !ISO.test(date)) return Response.json({ error: 'employeeId и date обязательны' }, { status: 400 });
  await setAttendance(getPrisma(), employeeId, date, present);
  return Response.json({ ok: true });
}

import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { loadFot } from '@/lib/db/fot-repo';
import { roleOf } from '@/lib/auth/roles';
import { staffMonth, todayMoscow } from '@/lib/staff/dates';
import { employeeCard } from '@/lib/staff/view-model';
import { ShiftsView } from '../_views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function StaffShiftsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const session = await auth();
  const role = roleOf(session);
  if (role === null) redirect('/login');
  const now = new Date();
  const month = staffMonth((await searchParams).month, now);
  const v = await loadFot(getPrisma(), month);
  const ctx = { month, today: todayMoscow(now), revenueDates: new Set(v.revenueDates) };
  // Только карточки пекарни: итоги (v.totals), кондитерка и фикс-выплаты сотрудникам не отдаются.
  const cards = v.bakery.map((row) => employeeCard(row, ctx));
  return <ShiftsView month={month} cards={cards} showOwnerLink={role === 'owner'} />;
}

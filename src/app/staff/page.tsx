import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { loadBreakdown } from '@/lib/db/breakdown-repo';
import { roleOf } from '@/lib/auth/roles';
import { staffMonth } from '@/lib/staff/dates';
import { staffRevenueRows } from '@/lib/staff/view-model';
import { RevenueView } from './_views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function StaffRevenuePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const month = staffMonth((await searchParams).month, new Date());
  const [session, v] = await Promise.all([auth(), loadBreakdown(getPrisma(), month)]);
  // В страницу уходят только дни — итоги месяца (v.totals) сотрудникам не отдаём.
  return <RevenueView month={month} rows={staffRevenueRows(v.days)} showOwnerLink={roleOf(session) === 'owner'} />;
}

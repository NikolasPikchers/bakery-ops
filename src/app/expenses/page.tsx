import { getPrisma } from '@/lib/db/client';
import { listExpenses } from '@/lib/db/finance-repo';
import { currentMonth } from '@/lib/finance/month';
import { MonthNav, PageHeader, pageStyle } from '../_ui';
import { ExpensesClient } from './ExpensesClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? '') ? (sp.month as string) : currentMonth(new Date());
  const expenses = await listExpenses(getPrisma(), { month });
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const today = new Date().toISOString().slice(0, 10);
  const q = (m: string) => `/expenses?month=${m}`;

  return (
    <div style={pageStyle}>
      <PageHeader title="Расходы" right={<MonthNav month={month} href={q} />} />
      <ExpensesClient expenses={expenses} total={total} today={today} />
    </div>
  );
}

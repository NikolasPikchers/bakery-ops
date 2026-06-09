import Link from 'next/link';
import { getPrisma } from '@/lib/db/client';
import { listExpenses } from '@/lib/db/finance-repo';
import { currentMonth, monthLabel, prevMonth, nextMonth } from '@/lib/finance/month';
import { ExpensesClient } from './ExpensesClient';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function ExpensesPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? '') ? (sp.month as string) : currentMonth(new Date());
  const expenses = await listExpenses(getPrisma(), { month });
  const total = expenses.reduce((s, e) => s + e.amount, 0);
  const q = (m: string) => `/expenses?month=${m}`;

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>Расходы</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card)', padding: '6px 8px', borderRadius: 12, border: '1px solid var(--line)' }}>
          <Link href={q(prevMonth(month))} style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 17 }}>‹</Link>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', minWidth: 110, textAlign: 'center' }}>{monthLabel(month)}</span>
          <Link href={q(nextMonth(month))} style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 17 }}>›</Link>
        </div>
      </div>
      <ExpensesClient expenses={expenses} total={total} />
    </div>
  );
}

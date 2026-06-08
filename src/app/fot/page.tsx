import Link from 'next/link';
import { getPrisma } from '@/lib/db/client';
import { loadFot } from '@/lib/db/fot-repo';
import { currentMonth, monthLabel, prevMonth, nextMonth } from '@/lib/finance/month';
import { BONUS_LEVELS } from '@/lib/fot/bonus-colors';
import { FotGrid } from './FotGrid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rub = (n: number) => '₽ ' + Math.round(n).toLocaleString('ru-RU');
const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 22, marginBottom: 18 };

export default async function FotPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? '') ? (sp.month as string) : currentMonth(new Date());
  const v = await loadFot(getPrisma(), month);
  const q = (m: string) => `/fot?month=${m}`;
  const t = v.totals;

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>ФОТ</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card)', padding: '6px 8px', borderRadius: 12, border: '1px solid var(--line)' }}>
          <Link href={q(prevMonth(month))} style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 17 }}>‹</Link>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', minWidth: 110, textAlign: 'center' }}>{monthLabel(month)}</span>
          <Link href={q(nextMonth(month))} style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 17 }}>›</Link>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16, fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>
        <span>Премия за день (фон ✓ у пекарей/кассира):</span>
        {BONUS_LEVELS.map((l) => (
          <span key={l.amount} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ width: 13, height: 13, borderRadius: 3, background: l.color, display: 'inline-block', border: '1px solid var(--line)' }} />
            {l.amount} ₽
          </span>
        ))}
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Пекарня</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
            к 15-му: <b style={{ color: 'var(--ink)' }}>{rub(t.bakeryTo15)}</b> · 2-я половина: <b style={{ color: 'var(--ink)' }}>{rub(t.bakeryAfter15)}</b> · за месяц: <b style={{ color: 'var(--profit)' }}>{rub(t.bakeryTotal)}</b>
          </div>
        </div>
        <FotGrid rows={v.bakery} monthDays={v.monthDays} semiMonthly />
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Кондитерка</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>за месяц: <b style={{ color: 'var(--profit)' }}>{rub(t.confectioneryTotal)}</b></div>
        </div>
        <FotGrid rows={v.confectionery} monthDays={v.monthDays} semiMonthly={false} />
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>
        Итого ФОТ за месяц: <b style={{ color: 'var(--ink)' }}>{rub(t.grand)}</b>. Клик по ячейке — переключить выход. Премии — от выручки Плюшкино за день.
      </p>
    </div>
  );
}

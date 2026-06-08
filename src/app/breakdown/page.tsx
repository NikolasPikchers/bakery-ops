import Link from 'next/link';
import { getPrisma } from '@/lib/db/client';
import { loadBreakdown } from '@/lib/db/breakdown-repo';
import { currentMonth, monthLabel, prevMonth, nextMonth } from '@/lib/finance/month';
import { StackBars } from '../_charts';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rub = (n: number) => '₽ ' + Math.round(n).toLocaleString('ru-RU');
const CONF = '#e0a458'; // кондитерка (\)
const OTHER = '#2563eb'; // пироги + прочее

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 22 };
const th: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 0 9px', textAlign: 'left' };
const td: React.CSSProperties = { padding: '9px 0', fontSize: 13.5, borderTop: '1px solid var(--line)', fontVariantNumeric: 'tabular-nums' };

function Dot({ c }: { c: string }) {
  return <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: 'inline-block' }} />;
}

function Kpi({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ ...card, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: color ?? 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {sub && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{sub}</span>}
    </div>
  );
}

export default async function BreakdownPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? '') ? (sp.month as string) : currentMonth(new Date());
  const v = await loadBreakdown(getPrisma(), month);
  const q = (m: string) => `/breakdown?month=${m}`;
  const t = v.totals;
  const confPct = t.total > 0 ? Math.round((t.confectionery / t.total) * 100) : 0;

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
        <div>
          <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>Разбивка выручки</h1>
          <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>Плюшкино · кондитерка vs пироги+прочее, по дням</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card)', padding: '6px 8px', borderRadius: 12, border: '1px solid var(--line)' }}>
          <Link href={q(prevMonth(month))} style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 17 }}>‹</Link>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', minWidth: 110, textAlign: 'center' }}>{monthLabel(month)}</span>
          <Link href={q(nextMonth(month))} style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 17 }}>›</Link>
        </div>
      </div>

      {v.days.length === 0 ? (
        <div style={card}>
          <p style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}>
            Нет данных за месяц. Загрузите дневные выгрузки iiko на странице <Link href="/revenue" style={{ color: 'var(--profit)', fontWeight: 700 }}>Выручка</Link>.
          </p>
        </div>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))', gap: 16, marginBottom: 18 }}>
            <Kpi label="Кондитерка" value={rub(t.confectionery)} color={CONF} sub={`${confPct}% выручки`} />
            <Kpi label="Пироги + прочее" value={rub(t.other)} color={OTHER} sub={`${100 - confPct}% выручки`} />
            <Kpi label="Всего за месяц" value={rub(t.total)} />
          </div>

          <div style={{ ...card, marginBottom: 18 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
              <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>По дням</div>
              <div style={{ display: 'flex', gap: 14, fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot c={CONF} />Кондитерка</span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot c={OTHER} />Пироги+прочее</span>
              </div>
            </div>
            <StackBars data={v.days} height={200} confColor={CONF} otherColor={OTHER} />
          </div>

          <div style={card}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  <th style={th}>Дата</th>
                  <th style={{ ...th, textAlign: 'right' }}>Кондитерка</th>
                  <th style={{ ...th, textAlign: 'right' }}>Пироги+прочее</th>
                  <th style={{ ...th, textAlign: 'right' }}>Всего</th>
                  <th style={{ ...th, textAlign: 'right' }}>Доля конд.</th>
                </tr>
              </thead>
              <tbody>
                {v.days.map((d) => (
                  <tr key={d.date}>
                    <td style={{ ...td, fontWeight: 700, color: 'var(--ink)' }}>{d.date.slice(8, 10)}.{d.date.slice(5, 7)}</td>
                    <td style={{ ...td, textAlign: 'right', color: '#b9772a', fontWeight: 700 }}>{rub(d.confectionery)}</td>
                    <td style={{ ...td, textAlign: 'right', color: OTHER, fontWeight: 700 }}>{rub(d.other)}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--ink)' }}>{rub(d.total)}</td>
                    <td style={{ ...td, textAlign: 'right', color: 'var(--muted)', fontWeight: 700 }}>{d.total > 0 ? Math.round((d.confectionery / d.total) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td style={{ ...td, fontWeight: 800, color: 'var(--ink)', borderTop: '2px solid var(--line)' }}>Итого</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: '#b9772a', borderTop: '2px solid var(--line)' }}>{rub(t.confectionery)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: OTHER, borderTop: '2px solid var(--line)' }}>{rub(t.other)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--ink)', borderTop: '2px solid var(--line)' }}>{rub(t.total)}</td>
                  <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--muted)', borderTop: '2px solid var(--line)' }}>{confPct}%</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

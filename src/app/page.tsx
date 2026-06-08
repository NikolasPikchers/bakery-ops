import Link from 'next/link';
import { getPrisma } from '@/lib/db/client';
import { loadDashboard, type DashboardPoint } from '@/lib/db/dashboard-repo';
import { currentMonth, monthLabel, prevMonth, nextMonth } from '@/lib/finance/month';
import { categoryLabel } from '@/lib/finance/categories';
import { POINTS } from '@/lib/domain/points';
import { Sparkline, Donut, DayBars } from './_charts';
import styles from './ui.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rub = (n: number) => '₽ ' + Math.round(n).toLocaleString('ru-RU');
const moneyK = (n: number) => Math.round(n / 1000).toLocaleString('ru-RU') + 'к';

const CAT_COLOR: Record<string, string> = {
  produkty: '#2e7d5b',
  arenda: '#e0a458',
  fot: '#5b8def',
  kommunalka: '#c0392b',
  nalogi: '#9b59b6',
  investicii: '#14b8a6',
  prochee: '#d8dedb',
};

const STATUS: Record<string, { t: string; c: string; bg: string }> = {
  needs_review: { t: 'Проверить', c: '#e0a458', bg: 'rgba(224,164,88,0.16)' },
  recognized: { t: 'Распознан', c: '#5b8def', bg: 'rgba(91,141,239,0.14)' },
  confirmed: { t: 'Подтверждён', c: '#2e7d5b', bg: 'rgba(46,125,91,0.14)' },
  uploaded: { t: 'Загружен', c: '#8a958f', bg: '#f1f4f2' },
};

const SHEET_TYPE_RU: Record<string, string> = { pies: 'Пироги', desserts: 'Десерты', confectionery_freeform: 'Кондитерка' };

function DeltaBadge({ v, invert, unit = '%', on }: { v: number | null; invert?: boolean; unit?: string; on?: boolean }) {
  if (v == null) return null;
  const positive = invert ? v < 0 : v > 0;
  const c = positive ? '#2e7d5b' : '#c0392b';
  const fg = on ? '#fff' : c;
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 3,
        color: fg,
        fontWeight: 700,
        fontSize: 12,
        background: on ? 'rgba(255,255,255,0.18)' : `${c}22`,
        padding: '2px 7px 2px 5px',
        borderRadius: 20,
        whiteSpace: 'nowrap',
      }}
    >
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke={fg} strokeWidth="3" style={{ transform: v >= 0 ? 'none' : 'scaleY(-1)' }}>
        <path d="m6 15 6-6 6 6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      {Math.abs(v).toFixed(1)} {unit}
    </span>
  );
}

const cardStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow)',
  padding: 22,
};

function KpiTile(props: {
  label: string;
  value: string;
  valueColor?: string;
  delta: number | null;
  deltaUnit?: string;
  invert?: boolean;
  spark: number[];
  sparkColor: string;
  sparkId: string;
  lead?: boolean;
}) {
  const { label, value, valueColor, delta, deltaUnit, invert, spark, sparkColor, sparkId, lead } = props;
  return (
    <div style={{ ...cardStyle, ...(lead ? { background: 'var(--profit)', border: 'none', color: '#fff' } : {}), display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: lead ? 'rgba(255,255,255,0.72)' : 'var(--muted)', whiteSpace: 'nowrap' }}>{label}</span>
        <DeltaBadge v={delta} invert={invert} unit={deltaUnit} on={lead} />
      </div>
      <div style={{ fontSize: lead ? 32 : 26, fontWeight: 800, letterSpacing: '-0.02em', fontVariantNumeric: 'tabular-nums', color: lead ? '#fff' : valueColor || 'var(--ink)' }}>{value}</div>
      <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: lead ? 'rgba(255,255,255,0.8)' : 'var(--muted)' }}>{delta == null ? 'нет базы' : 'к пр. месяцу'}</span>
        <Sparkline data={spark} id={sparkId} width={96} height={26} color={lead ? '#bdf0d3' : sparkColor} />
      </div>
    </div>
  );
}

function Panel({ title, extra, children }: { title: string; extra?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div style={cardStyle}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14, gap: 12 }}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{title}</div>
        {extra}
      </div>
      {children}
    </div>
  );
}

const th: React.CSSProperties = { fontSize: 11, color: 'var(--muted)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', padding: '0 0 9px', textAlign: 'left' };
const td: React.CSSProperties = { padding: '10px 0', fontSize: 13.5, borderTop: '1px solid var(--line)' };

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ point?: string; month?: string }> }) {
  const sp = await searchParams;
  const point: DashboardPoint = sp.point === 'point-1' || sp.point === 'point-2' ? sp.point : 'all';
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? '') ? (sp.month as string) : currentMonth(new Date());
  const asOf = currentMonth(new Date()) === month ? new Date().toISOString().slice(0, 10) : `${month}-28`;

  const v = await loadDashboard(getPrisma(), { point, month, asOf });
  const f = v.finance;
  const expenseTotal = f.byCategory.reduce((s, c) => s + c.amount, 0);
  const q = (p: DashboardPoint, mo: string) => `/?point=${p}&month=${mo}`;
  const showAging = point === 'all' || point === 'point-2';
  const pills: { id: DashboardPoint; name: string }[] = [{ id: 'all', name: 'Все' }, ...POINTS.map((p) => ({ id: p.id as DashboardPoint, name: p.name }))];

  return (
    <div style={{ padding: '24px 28px' }}>
      {/* header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 22, flexWrap: 'wrap', gap: 14 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
          <h1 style={{ fontSize: 30, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>Дашборд</h1>
          <div style={{ display: 'flex', gap: 4, background: 'var(--chip)', padding: 4, borderRadius: 999 }}>
            {pills.map((p) => {
              const active = point === p.id;
              return (
                <Link key={p.id} href={q(p.id, month)} style={{ padding: '7px 15px', borderRadius: 999, fontSize: 13.5, fontWeight: 700, color: active ? '#fff' : 'var(--muted)', background: active ? 'var(--brand)' : 'transparent' }}>{p.name}</Link>
              );
            })}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card)', padding: '6px 8px', borderRadius: 12, border: '1px solid var(--line)' }}>
            <Link href={q(point, prevMonth(month))} style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 17 }}>‹</Link>
            <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', minWidth: 110, textAlign: 'center' }}>{monthLabel(month)}</span>
            <Link href={q(point, nextMonth(month))} style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 17 }}>›</Link>
          </div>
          <Link href="/revenue" style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'var(--profit)', color: '#fff', padding: '11px 18px', borderRadius: 12, fontSize: 14, fontWeight: 700 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2"><path d="M12 5v14M5 12h14" strokeLinecap="round" /></svg>
            Выручка
          </Link>
        </div>
      </div>

      {/* KPI row */}
      <div className={styles.dashKpis}>
        <KpiTile lead label="Чистая прибыль" value={rub(f.profit)} delta={f.profitDelta} spark={v.trend.profit} sparkColor="#bdf0d3" sparkId="sp-profit" />
        <KpiTile label="Выручка · iiko" value={rub(f.revenue)} valueColor="var(--revenue)" delta={f.revenueDelta} spark={v.trend.revenue} sparkColor="var(--revenue)" sparkId="sp-rev" />
        <KpiTile label="Расходы · Т-Бизнес" value={rub(f.expense)} valueColor="var(--expense)" delta={f.expenseDelta} invert spark={v.trend.expense} sparkColor="var(--expense)" sparkId="sp-exp" />
        <KpiTile label="Маржинальность" value={f.margin == null ? '—' : `${f.margin.toFixed(1)}%`} delta={f.marginDelta} deltaUnit="п.п." spark={v.trend.margin} sparkColor="var(--profit)" sparkId="sp-mar" />
      </div>

      {/* row 1: revenue by day + expense structure */}
      <div className={styles.dashRow}>
        <Panel title="Выручка по дням" extra={<span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}><span style={{ width: 10, height: 10, borderRadius: 4, background: 'var(--revenue)' }} />iiko · ₽/день</span>}>
          {f.revenue === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600, padding: '40px 2px' }}>Нет выручки за месяц. Внесите её на странице <Link href="/revenue" style={{ color: 'var(--profit)', fontWeight: 700 }}>Выручка</Link>.</p>
          ) : (
            <DayBars data={f.byDay} color="#2563eb" height={178} />
          )}
        </Panel>
        <Panel title="Структура расходов">
          {f.byCategory.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600, padding: '40px 2px' }}>Нет расходов за месяц.</p>
          ) : (
            <div style={{ display: 'flex', gap: 16, alignItems: 'center' }}>
              <Donut size={118} thickness={20} center={moneyK(expenseTotal)} sub="всего" segments={f.byCategory.map((c) => ({ value: c.amount, color: CAT_COLOR[c.category] ?? '#d8dedb' }))} />
              <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 7 }}>
                {f.byCategory.map((c) => (
                  <div key={c.category} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}><span style={{ width: 9, height: 9, borderRadius: 3, background: CAT_COLOR[c.category] ?? '#d8dedb' }} />{categoryLabel(c.category)}</span>
                    <span style={{ fontSize: 12.5, fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{Math.round(c.pct)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Panel>
      </div>

      {/* row 2: остатки + залежалось */}
      <div className={styles.dashRow}>
        <Panel title="Остатки сейчас" extra={<span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>распознано из листов</span>}>
          {v.ostatki.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600, padding: '12px 2px' }}>Нет данных. Загрузите листы во вкладке «Загрузить».</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Товар</th><th style={th}>Точка</th><th style={{ ...th, textAlign: 'right' }}>Остаток</th></tr></thead>
              <tbody>
                {v.ostatki.map((o, i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight: 700, color: 'var(--ink)' }}>{o.productName}</td>
                    <td style={{ ...td, color: 'var(--muted)', fontWeight: 600 }}>{o.pointName}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{o.ostatok}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Залежалось · Корица" extra={<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="var(--expense)" strokeWidth="1.8"><path d="M12 2s5 4 5 9a5 5 0 0 1-10 0c0-1.5.6-2.8 1.4-3.8C8.9 8.6 9 10 10 10c1.3 0 1-2.5 1-4 0-2 1-4 1-4Z" strokeLinecap="round" strokeLinejoin="round" /></svg>}>
          {!showAging ? (
            <p style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600, padding: '12px 2px' }}>Доступно для Корицы.</p>
          ) : v.aging.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600, padding: '12px 2px' }}>Нет залежавшихся позиций.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Десерт</th><th style={{ ...th, textAlign: 'right' }}>Возраст</th><th style={{ ...th, textAlign: 'right' }}>Ост.</th></tr></thead>
              <tbody>
                {v.aging.map((a, i) => (
                  <tr key={i} style={a.stale ? { background: 'rgba(224,164,88,0.1)' } : undefined}>
                    <td style={{ ...td, fontWeight: 700, color: 'var(--ink)' }}>{a.productName}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: a.stale ? '#b9772a' : 'var(--muted)', fontVariantNumeric: 'tabular-nums' }}>{a.ageDays == null ? '—' : `${a.ageDays} дн`}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{a.ostatok}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>

      {/* row 3: списания + листы */}
      <div className={`${styles.dashRow} ${styles.last}`}>
        <Panel title="Списания за месяц" extra={<span style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>топ позиций</span>}>
          {v.spisaniya.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600, padding: '12px 2px' }}>Нет списаний.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Товар</th><th style={th}>Точка</th><th style={{ ...th, textAlign: 'right' }}>Списано</th></tr></thead>
              <tbody>
                {v.spisaniya.slice(0, 10).map((s, i) => (
                  <tr key={i}>
                    <td style={{ ...td, fontWeight: 700, color: 'var(--ink)' }}>{s.productName}</td>
                    <td style={{ ...td, color: 'var(--muted)', fontWeight: 600 }}>{s.pointName}</td>
                    <td style={{ ...td, textAlign: 'right', fontWeight: 800, color: 'var(--expense)', fontVariantNumeric: 'tabular-nums' }}>{s.total}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
        <Panel title="Листы на проверке" extra={<Link href="/sheets" style={{ fontSize: 12.5, color: 'var(--profit)', fontWeight: 700 }}>Открыть</Link>}>
          {v.sheetsQueue.length === 0 ? (
            <p style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600, padding: '12px 2px' }}>Очередь пуста.</p>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>Дата</th><th style={th}>Точка</th><th style={{ ...th, textAlign: 'right' }}></th></tr></thead>
              <tbody>
                {v.sheetsQueue.map((s) => {
                  const st = STATUS.needs_review;
                  return (
                    <tr key={s.id}>
                      <td style={{ ...td, color: 'var(--muted)', fontWeight: 600 }}>{s.date}</td>
                      <td style={{ ...td, fontWeight: 700, color: 'var(--ink)' }}><Link href={`/sheets/${s.id}`}>{s.pointName} · {SHEET_TYPE_RU[s.sheetType] ?? s.sheetType}</Link></td>
                      <td style={{ ...td, textAlign: 'right' }}><span style={{ fontSize: 11.5, fontWeight: 700, color: st.c, background: st.bg, padding: '3px 9px', borderRadius: 7, whiteSpace: 'nowrap' }}>{st.t}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </div>
  );
}

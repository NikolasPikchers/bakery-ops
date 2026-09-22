import Link from 'next/link';
import { getPrisma } from '@/lib/db/client';
import { loadBreakdown } from '@/lib/db/breakdown-repo';
import { currentMonth } from '@/lib/finance/month';
import { StackBars } from '../_charts';
import { Card, CardHead, Empty, Kpi, MonthNav, PageHeader, Table, headRowStyle, kpiGridStyle, numStyle, pageStyle, rowStyle } from '../_ui';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rub = (n: number) => '₽ ' + Math.round(n).toLocaleString('ru-RU');
const CONF = '#e0a458'; // кондитерка (\)
const OTHER = '#2563eb'; // пироги + прочее
const CONF_INK = '#b9772a'; // кондитерка в тексте таблицы — темнее, чтобы читалось

function Dot({ c }: { c: string }) {
  return <span style={{ width: 10, height: 10, borderRadius: 3, background: c, display: 'inline-block' }} />;
}

export default async function BreakdownPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? '') ? (sp.month as string) : currentMonth(new Date());
  const v = await loadBreakdown(getPrisma(), month);
  const q = (m: string) => `/breakdown?month=${m}`;
  const t = v.totals;
  const confPct = t.total > 0 ? Math.round((t.confectionery / t.total) * 100) : 0;
  const n = v.days.length;
  const avg = (x: number) => (n ? x / n : 0);

  return (
    <div style={pageStyle}>
      <PageHeader
        title="Разбивка выручки"
        subtitle="Плюшкино · пироги+прочее vs кондитерка, по дням"
        right={<MonthNav month={month} href={q} />}
      />

      {v.days.length === 0 ? (
        <Card>
          <Empty>
            Нет данных за месяц. Загрузите дневные выгрузки iiko на странице{' '}
            <Link href="/revenue" style={{ color: 'var(--profit)', fontWeight: 700 }}>Выручка</Link>.
          </Empty>
        </Card>
      ) : (
        <>
          {/* Итоги за месяц: пироги+прочее идут первыми */}
          <div style={kpiGridStyle}>
            <Kpi label="Пироги + прочее" value={rub(t.other)} color={OTHER} sub={`${100 - confPct}% выручки`} />
            <Kpi label="Кондитерка" value={rub(t.confectionery)} color={CONF} sub={`${confPct}% выручки`} />
            <Kpi label="Всего за месяц" value={rub(t.total)} />
          </div>

          <div style={kpiGridStyle}>
            <Kpi label="Пироги+прочее / день" value={rub(avg(t.other))} color={OTHER} sub={`в среднем за ${n} дн`} />
            <Kpi label="Кондитерка / день" value={rub(avg(t.confectionery))} color={CONF} sub={`в среднем за ${n} дн`} />
            <Kpi label="Всего / день" value={rub(avg(t.total))} sub={`в среднем за ${n} дн`} />
          </div>

          <Card>
            <CardHead
              title="Выручка по дням"
              mb={14}
              meta={
                <span style={{ display: 'flex', gap: 14, flexWrap: 'wrap' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot c={OTHER} />Пироги+прочее</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}><Dot c={CONF} />Кондитерка</span>
                </span>
              }
            />
            {/* Пироги+прочее — низ стека (синий), кондитерка — верх (оранжевый) */}
            <StackBars data={v.days} height={200} confColor={CONF} otherColor={OTHER} />
          </Card>

          <Card>
            <CardHead
              title="Таблица по дням"
              meta={<>дней: <b style={{ color: 'var(--ink)' }}>{n}</b> · итого: <b style={{ color: 'var(--ink)' }}>{rub(t.total)}</b></>}
            />
            <Table>
              <thead>
                <tr style={headRowStyle}>
                  <th style={{ padding: '0 8px 8px 0' }}>Дата</th>
                  <th style={{ padding: '0 8px 8px', textAlign: 'right' }}>Пироги+прочее</th>
                  <th style={{ padding: '0 8px 8px', textAlign: 'right' }}>Кондитерка</th>
                  <th style={{ padding: '0 8px 8px', textAlign: 'right' }}>Всего</th>
                  <th style={{ padding: '0 0 8px 8px', textAlign: 'right' }}>Доля конд.</th>
                </tr>
              </thead>
              <tbody>
                {v.days.map((d) => (
                  <tr key={d.date} style={rowStyle}>
                    <td style={{ padding: '8px 8px 8px 0', whiteSpace: 'nowrap', color: 'var(--ink)', fontWeight: 700 }}>{d.date.slice(8, 10)}.{d.date.slice(5, 7)}</td>
                    <td style={{ padding: '8px', ...numStyle, color: OTHER, fontWeight: 700 }}>{rub(d.other)}</td>
                    <td style={{ padding: '8px', ...numStyle, color: CONF_INK, fontWeight: 700 }}>{rub(d.confectionery)}</td>
                    <td style={{ padding: '8px', ...numStyle, color: 'var(--ink)', fontWeight: 800 }}>{rub(d.total)}</td>
                    <td style={{ padding: '8px 0 8px 8px', ...numStyle, color: 'var(--muted)', fontWeight: 700 }}>{d.total > 0 ? Math.round((d.confectionery / d.total) * 100) : 0}%</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid var(--line)' }}>
                  <td style={{ padding: '8px 8px 8px 0', whiteSpace: 'nowrap', color: 'var(--ink)', fontWeight: 800 }}>Итого</td>
                  <td style={{ padding: '8px', ...numStyle, color: OTHER, fontWeight: 800 }}>{rub(t.other)}</td>
                  <td style={{ padding: '8px', ...numStyle, color: CONF_INK, fontWeight: 800 }}>{rub(t.confectionery)}</td>
                  <td style={{ padding: '8px', ...numStyle, color: 'var(--ink)', fontWeight: 800 }}>{rub(t.total)}</td>
                  <td style={{ padding: '8px 0 8px 8px', ...numStyle, color: 'var(--muted)', fontWeight: 800 }}>{confPct}%</td>
                </tr>
              </tfoot>
            </Table>
          </Card>
        </>
      )}
    </div>
  );
}

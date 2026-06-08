import Link from 'next/link';
import { getPrisma } from '@/lib/db/client';
import { loadDashboard, type DashboardPoint } from '@/lib/db/dashboard-repo';
import { currentMonth, monthLabel, prevMonth, nextMonth } from '@/lib/finance/month';
import { categoryLabel } from '@/lib/finance/categories';
import { POINTS } from '@/lib/domain/points';
import styles from './ui.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ruble = (n: number) => `₽ ${Math.round(n).toLocaleString('ru-RU')}`;
const CAT_COLORS = ['#2E7D5B', '#E0A458', '#5B8DEF', '#C0392B', '#9B59B6', '#d8dedb'];

function pct(n: number | null): string {
  if (n == null) return '';
  const s = n >= 0 ? '▲' : '▼';
  return `${s} ${Math.abs(n).toFixed(1)}%`;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ point?: string; month?: string }> }) {
  const sp = await searchParams;
  const point: DashboardPoint = sp.point === 'point-1' || sp.point === 'point-2' ? sp.point : 'all';
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? (sp.month as string) : currentMonth(new Date());
  const asOf = currentMonth(new Date()) === month ? new Date().toISOString().slice(0, 10) : `${month}-28`;

  const v = await loadDashboard(getPrisma(), { point, month, asOf });
  const f = v.finance;

  const maxRev = Math.max(1, ...f.byDay.map((d) => d.revenue));
  const segs = f.byCategory.reduce<{ segments: string[]; acc: number }>(
    ({ segments, acc }, c, i) => {
      const from = acc;
      const next = acc + c.pct;
      return {
        segments: [...segments, `${CAT_COLORS[i % CAT_COLORS.length]} ${from}% ${next}%`],
        acc: next,
      };
    },
    { segments: [], acc: 0 },
  ).segments;
  const donut = segs.length ? `conic-gradient(${segs.join(',')})` : '#eceeec';

  const q = (p: DashboardPoint, mo: string) => `/?point=${p}&month=${mo}`;
  const showAging = point === 'all' || point === 'point-2';

  return (
    <main className={styles.shell}>
      <h1>Дашборд</h1>

      <div className={styles.filters}>
        <Link className={`${styles.pill} ${point === 'all' ? styles.pillOn : ''}`} href={q('all', month)}>Все</Link>
        {POINTS.map((p) => (
          <Link key={p.id} className={`${styles.pill} ${point === p.id ? styles.pillOn : ''}`} href={q(p.id as DashboardPoint, month)}>{p.name}</Link>
        ))}
        <span style={{ flex: 1 }} />
        <Link className={styles.month} href={q(point, prevMonth(month))}>←</Link>
        <span className={styles.month} style={{ borderColor: 'transparent' }}>{monthLabel(month)}</span>
        <Link className={styles.month} href={q(point, nextMonth(month))}>→</Link>
      </div>

      <div className={styles.kpis}>
        <div className={`${styles.kpi} ${styles.kpiLead}`}>
          <div className={styles.kpiLab}>Чистая прибыль</div>
          <div className={styles.kpiVal}>{ruble(f.profit)}</div>
          <div className={styles.delta}>{pct(f.profitDelta)}{f.profitDelta != null ? ' к пр. мес.' : ''}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLab}>Выручка · iiko</div>
          <div className={`${styles.kpiVal} ${styles.sm}`} style={{ color: 'var(--revenue)' }}>{ruble(f.revenue)}</div>
          <div className={`${styles.delta} ${(f.revenueDelta ?? 0) >= 0 ? styles.up : styles.down}`}>{pct(f.revenueDelta)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLab}>Расходы · Т-Бизнес</div>
          <div className={`${styles.kpiVal} ${styles.sm}`} style={{ color: 'var(--expense)' }}>{ruble(f.expense)}</div>
          <div className={`${styles.delta} ${(f.expenseDelta ?? 0) <= 0 ? styles.up : styles.down}`}>{pct(f.expenseDelta)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLab}>Маржинальность</div>
          <div className={`${styles.kpiVal} ${styles.sm}`}>{f.margin == null ? '—' : `${f.margin.toFixed(1)}%`}</div>
          <div className={styles.delta}>{f.marginDelta == null ? '' : `${f.marginDelta >= 0 ? '▲' : '▼'} ${Math.abs(f.marginDelta).toFixed(1)} п.п.`}</div>
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.panel}>
          <div className={styles.panelTtl}>Выручка по дням</div>
          {f.revenue === 0 ? (
            <p className={styles.empty}>Нет данных по выручке. Внесите её на странице <Link href="/finance">Финансы</Link>.</p>
          ) : (
            <div className={styles.bars}>
              {f.byDay.map((d) => (
                <div key={d.date} title={`${d.date}: ${ruble(d.revenue)}`} style={{ height: `${Math.max(2, (d.revenue / maxRev) * 100)}%` }} />
              ))}
            </div>
          )}
        </div>
        <div className={styles.panel}>
          <div className={styles.panelTtl}>Структура расходов</div>
          {f.byCategory.length === 0 ? (
            <p className={styles.empty}>Нет расходов за месяц.</p>
          ) : (
            <>
              <div className={styles.donut} style={{ background: donut }} />
              <div className={styles.legend}>
                {f.byCategory.map((c, i) => (
                  <div key={c.category}><i style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />{categoryLabel(c.category)} · {c.pct.toFixed(0)}% · {ruble(c.amount)}</div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.panel}>
          <div className={styles.panelTtl}>Остатки сейчас</div>
          {v.ostatki.length === 0 ? (
            <p className={styles.empty}>Нет данных. Загрузите листы во вкладке «Загрузить».</p>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Товар</th><th>Точка</th><th className={styles.num}>Остаток</th></tr></thead>
              <tbody>
                {v.ostatki.map((o, i) => (
                  <tr key={i}><td>{o.productName}</td><td>{o.pointName}</td><td className={styles.num}>{o.ostatok}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className={styles.panel}>
          <div className={styles.panelTtl}>Залежалось · Корица</div>
          {!showAging ? (
            <p className={styles.empty}>Доступно для Корицы.</p>
          ) : v.aging.length === 0 ? (
            <p className={styles.empty}>Нет залежавшихся позиций.</p>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Десерт</th><th className={styles.num}>Возраст</th><th className={styles.num}>Ост.</th></tr></thead>
              <tbody>
                {v.aging.map((a, i) => (
                  <tr key={i} className={a.stale ? styles.stale : ''}>
                    <td>{a.productName}</td>
                    <td className={`${styles.num} ${a.stale ? styles.age : ''}`}>{a.ageDays == null ? '—' : `${a.ageDays} дн`}</td>
                    <td className={styles.num}>{a.ostatok}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.panel}>
          <div className={styles.panelTtl}>Списания за месяц (топ)</div>
          {v.spisaniya.length === 0 ? (
            <p className={styles.empty}>Нет списаний.</p>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Товар</th><th>Точка</th><th className={styles.num}>Списано</th></tr></thead>
              <tbody>
                {v.spisaniya.slice(0, 10).map((s, i) => (
                  <tr key={i}><td>{s.productName}</td><td>{s.pointName}</td><td className={styles.num}>{s.total}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className={styles.panel}>
          <div className={styles.panelTtl}>Листы на проверке</div>
          {v.sheetsQueue.length === 0 ? (
            <p className={styles.empty}>Очередь пуста.</p>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Дата</th><th>Точка</th><th>Тип</th><th></th></tr></thead>
              <tbody>
                {v.sheetsQueue.map((s) => (
                  <tr key={s.id}><td>{s.date}</td><td>{s.pointName}</td><td>{s.sheetType}</td><td><Link href={`/sheets/${s.id}`}>проверить →</Link></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}

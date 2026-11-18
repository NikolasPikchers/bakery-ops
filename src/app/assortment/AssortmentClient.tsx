'use client';

import { useMemo, useState } from 'react';
import { selectionSummary, type AbcClass, type AssortmentItem, type AssortmentView } from '@/lib/assortment/analyze';
import { CATEGORY_LABEL, type DishCategory } from '@/lib/assortment/classify';
import { Sparkline } from '../_charts';
import { Card, CardHead, Empty, Kpi, Table, btnStyle, cardStyle, headRowStyle, hintStyle, kpiGridStyle, numStyle, rowStyle } from '../_ui';
import { ddmmyyyy, money, percent, plural, qty } from './format';

type Summary = ReturnType<typeof selectionSummary>;

/** «Отмечено 5 позиций: 14 200 ₽/мес — 0,8% выручки · отдельно их брали в 6% чеков». */
export function lossMessage(s: Summary): string {
  const verb = plural(s.count, 'Отмечена', 'Отмечено', 'Отмечено');
  const base = `${verb} ${s.count} ${plural(s.count, 'позиция', 'позиции', 'позиций')}: ${money(s.perMonth)} ₽/мес — ${percent(s.share)} выручки`;
  return s.soloShare == null ? base : `${base} · отдельно их брали в ${percent(Math.round(s.soloShare))} чеков`;
}

const ABC_STYLE: Record<AbcClass, { color: string; background: string }> = {
  A: { color: '#2e7d5b', background: '#2e7d5b1f' },
  B: { color: '#9a6412', background: '#e0a45833' },
  C: { color: '#c0392b', background: '#c0392b1a' },
};

function Badge({ children, color, background, title }: { children: React.ReactNode; color: string; background: string; title?: string }) {
  return (
    <span title={title} style={{ display: 'inline-block', minWidth: 22, textAlign: 'center', padding: '2px 7px', borderRadius: 999, fontSize: 11.5, fontWeight: 800, color, background, whiteSpace: 'nowrap' }}>
      {children}
    </span>
  );
}

function ItemBadge({ item }: { item: AssortmentItem }) {
  if (item.abc) return <Badge {...ABC_STYLE[item.abc]}>{item.abc}</Badge>;
  if (item.status === 'new') return <Badge color="#2563eb" background="#2563eb1a">новинка</Badge>;
  if (item.status === 'order') return <Badge color="var(--muted)" background="var(--chip)">заказ</Badge>;
  return <Badge color="var(--muted)" background="var(--chip)">снято</Badge>;
}

function Trend({ v }: { v: number | null }) {
  if (v == null) return <span style={{ color: 'var(--muted)' }}>—</span>;
  const color = v > 0 ? '#2e7d5b' : v < 0 ? '#c0392b' : 'var(--muted)';
  return <span style={{ color, fontWeight: 700 }}>{v > 0 ? '▲' : v < 0 ? '▼' : ''} {percent(Math.abs(Math.round(v)))}</span>;
}

const th: React.CSSProperties = { padding: '0 8px 8px', whiteSpace: 'nowrap' };
const td: React.CSSProperties = { padding: '9px 8px', verticalAlign: 'middle' };

function ItemsTable(props: {
  items: AssortmentItem[];
  openDays: number;
  selected: Set<string>;
  toggle: (id: string) => void;
  date?: { label: string; pick: (i: AssortmentItem) => string };
}) {
  const { items, openDays, selected, toggle, date } = props;
  return (
    <Table>
      <thead>
        <tr style={headRowStyle}>
          <th style={{ ...th, paddingLeft: 0, width: 28 }} />
          <th style={th}>Позиция</th>
          <th style={th}>Класс</th>
          <th style={{ ...th, textAlign: 'right' }} title="Выручка за период, пересчитанная на 30 дней">₽ в месяц</th>
          <th style={{ ...th, textAlign: 'right' }} title="Доля выручки за период">Доля</th>
          <th style={{ ...th, textAlign: 'right' }} title="Дней, когда позиция продавалась, из дней работы точки">В продаже, дн</th>
          <th style={{ ...th, textAlign: 'right' }} title="Сколько штук уходит в день, когда позиция есть: отличает «не берут» от «редко пекут»">Шт. в день</th>
          <th style={{ ...th, textAlign: 'right' }} title="Последние 30 дней к предыдущим 30">Тренд</th>
          <th style={th} title="Выручка по неделям периода">По неделям</th>
          <th style={{ ...th, textAlign: 'right' }} title="Доля чеков, где позицию купили одну: ради неё пришли (при 20+ чеках)">Отдельно</th>
          <th style={{ ...th, textAlign: 'right' }} title="Наценка к себестоимости из iiko — если она заполнена">Наценка</th>
          {date && <th style={{ ...th, textAlign: 'right' }}>{date.label}</th>}
        </tr>
      </thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.dishId} style={{ ...rowStyle, background: selected.has(i.dishId) ? '#c0392b0d' : undefined }}>
            <td style={{ ...td, paddingLeft: 0 }}>
              <input type="checkbox" checked={selected.has(i.dishId)} onChange={() => toggle(i.dishId)} aria-label={`Отметить «${i.name}»`} style={{ width: 16, height: 16, accentColor: '#c0392b', colorScheme: 'light', cursor: 'pointer' }} />
            </td>
            <td style={{ ...td, minWidth: 190 }}>
              <div style={{ fontWeight: 700, color: 'var(--ink)' }}>{i.name}</div>
              <div style={{ fontSize: 11.5, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>{CATEGORY_LABEL[i.category]}</div>
            </td>
            <td style={td}><ItemBadge item={i} /></td>
            <td style={{ ...td, ...numStyle, fontWeight: 800, color: 'var(--ink)' }}>{money(i.perMonth)}</td>
            <td style={{ ...td, ...numStyle, color: 'var(--muted)', fontWeight: 700 }}>{percent(i.share)}</td>
            <td style={{ ...td, ...numStyle, fontWeight: 600 }}>{i.daysSold} из {openDays}</td>
            <td style={{ ...td, ...numStyle, fontWeight: 600 }}>{qty(i.qtyPerSoldDay)}</td>
            <td style={{ ...td, ...numStyle }}><Trend v={i.trend} /></td>
            <td style={td}><Sparkline data={i.weekly} id={`w-${i.dishId}`} width={84} height={24} fill={false} color={i.abc === 'C' ? '#c0392b' : '#2e7d5b'} /></td>
            <td style={{ ...td, ...numStyle, fontWeight: 600 }}>{i.soloShare == null ? <span style={{ color: 'var(--muted)' }}>—</span> : percent(Math.round(i.soloShare))}</td>
            <td style={{ ...td, ...numStyle, fontWeight: 600 }}>{i.markup == null ? <span style={{ color: 'var(--muted)' }}>—</span> : percent(Math.round(i.markup))}</td>
            {date && <td style={{ ...td, ...numStyle, fontWeight: 600 }}>{ddmmyyyy(date.pick(i))}</td>}
          </tr>
        ))}
      </tbody>
    </Table>
  );
}

const chip = (active: boolean): React.CSSProperties => ({
  padding: '8px 14px',
  borderRadius: 999,
  border: 'none',
  fontSize: 13.5,
  fontWeight: 700,
  cursor: 'pointer',
  color: active ? 'var(--ink)' : 'var(--muted)',
  background: active ? 'var(--card)' : 'transparent',
  boxShadow: active ? 'var(--shadow)' : 'none',
});

/** Кандидаты на сокращение, вся линейка, новинки, снятое; галочки считают «что потеряю». */
export function AssortmentClient({ view }: { view: AssortmentView }) {
  const [category, setCategory] = useState<'all' | DishCategory>('all');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [weakFirst, setWeakFirst] = useState(false);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const shown = useMemo(() => view.items.filter((i) => category === 'all' || i.category === category), [view.items, category]);
  const categories = useMemo(() => (Object.keys(CATEGORY_LABEL) as DishCategory[]).filter((c) => view.items.some((i) => i.category === c)), [view.items]);
  const candidates = shown.filter((i) => i.abc === 'C').sort((a, b) => a.revenue - b.revenue);
  const line = shown.filter((i) => i.status === 'active' || i.status === 'order');
  const lineSorted = weakFirst ? [...line].reverse() : line;
  const fresh = shown.filter((i) => i.status === 'new');
  const stopped = shown.filter((i) => i.status === 'stopped').sort((a, b) => b.lastSale.localeCompare(a.lastSale));
  const summary = selectionSummary(view.items, selected, view.totalRevenue);
  const c = view.counts;
  const tableProps = { openDays: view.openDays, selected, toggle };

  return (
    <>
      <div style={kpiGridStyle}>
        <Kpi label="В продаже" value={String(c.onSale)} sub="позиций за последние 14 дней" />
        <Kpi label="Класс A" value={String(c.A)} color={ABC_STYLE.A.color} sub={`${percent(view.abcShare.A)} выручки`} />
        <Kpi label="Класс B" value={String(c.B)} color={ABC_STYLE.B.color} sub={`${percent(view.abcShare.B)} выручки`} />
        <Kpi label="Класс C — кандидаты" value={String(c.C)} color={ABC_STYLE.C.color} sub={`${percent(view.abcShare.C)} выручки`} />
        <Kpi label="Новинки" value={String(c.new)} sub="в продаже меньше 60 дней" />
      </div>

      <div style={{ display: 'flex', gap: 4, background: 'var(--chip)', padding: 5, borderRadius: 999, marginBottom: 18, flexWrap: 'wrap', width: 'fit-content', maxWidth: '100%' }}>
        {(['all', ...categories] as const).map((k) => (
          <button key={k} type="button" onClick={() => setCategory(k)} style={chip(category === k)}>
            {k === 'all' ? 'Все' : CATEGORY_LABEL[k]}
          </button>
        ))}
      </div>

      <Card>
        <CardHead title="Кандидаты на сокращение" meta={<>класс C · {candidates.length} {plural(candidates.length, 'позиция', 'позиции', 'позиций')}</>} mb={6} />
        <p style={{ ...hintStyle, marginBottom: 14 }}>
          Последние 5% выручки среди позиций, которые продаются дольше 60 дней. Новинки, сезонное и заказные пироги сюда не попадают.
          Мало дней в продаже при хороших штуках в день — скорее «редко пекут», чем «не берут». Высокое «отдельно» — за позицией приходят специально.
          Отметьте позиции — внизу посчитается, сколько выручки они дают.
        </p>
        {candidates.length === 0 ? <Empty>В этой категории кандидатов нет.</Empty> : <ItemsTable items={candidates} {...tableProps} />}
      </Card>

      <Card>
        <CardHead
          title="Все позиции"
          meta={
            <button type="button" onClick={() => setWeakFirst((w) => !w)} style={{ border: 'none', background: 'none', color: 'var(--profit)', fontWeight: 700, fontSize: 13, cursor: 'pointer', padding: 0 }}>
              {weakFirst ? 'сначала сильные' : 'сначала слабые'}
            </button>
          }
        />
        {line.length === 0 ? <Empty>В этой категории позиций нет.</Empty> : <ItemsTable items={lineSorted} {...tableProps} />}
      </Card>

      {fresh.length > 0 && (
        <Card>
          <CardHead title="Новинки" meta="в продаже меньше 60 дней — оценивать рано" />
          <ItemsTable items={fresh} {...tableProps} date={{ label: 'В продаже с', pick: (i) => i.firstSale }} />
        </Card>
      )}

      {stopped.length > 0 && (
        <Card>
          <details>
            <summary style={{ cursor: 'pointer', fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>
              Уже не продаются <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>· {stopped.length} · сезонное или снятое, без продаж 14+ дней</span>
            </summary>
            <div style={{ marginTop: 12 }}>
              <ItemsTable items={stopped} {...tableProps} date={{ label: 'Последняя продажа', pick: (i) => i.lastSale }} />
            </div>
          </details>
        </Card>
      )}

      {summary.count > 0 && (
        <div
          role="status"
          style={{
            ...cardStyle,
            position: 'sticky',
            bottom: 16,
            zIndex: 5,
            padding: '14px 18px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            flexWrap: 'wrap',
            boxShadow: '0 8px 28px rgba(31, 42, 37, 0.18)',
            borderColor: '#c0392b55',
          }}
        >
          <span style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>{lossMessage(summary)}</span>
          <span style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>оценка сверху: часть покупателей возьмёт другое</span>
            <button type="button" onClick={() => setSelected(new Set())} style={{ ...btnStyle, background: 'var(--chip)', color: 'var(--ink)' }}>
              Сбросить
            </button>
          </span>
        </div>
      )}
    </>
  );
}

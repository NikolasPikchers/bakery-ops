import type { CalendarCell, EmployeeCardModel, PayoutLine, StaffRevenueRow } from '@/lib/staff/view-model';
import { bonusColor } from '@/lib/fot/bonus-colors';
import { CONF_INK, PIES, StaffPage, rub } from './_chrome';

export const cardStyle: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16 };
const emptyStyle: React.CSSProperties = { ...cardStyle, padding: 16, fontSize: 14, fontWeight: 600, color: 'var(--muted)' };
const noteStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.5, margin: '0 2px 10px' };
const th: React.CSSProperties = { textAlign: 'right', padding: '8px 0', fontSize: 12, fontWeight: 700, color: 'var(--muted)' };
const num: React.CSSProperties = { textAlign: 'right', padding: '10px 0 10px 6px', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

export function RevenueView({ month, rows, showOwnerLink }: { month: string; rows: StaffRevenueRow[]; showOwnerLink: boolean }) {
  return (
    <StaffPage tab="revenue" title="Выручка" month={month} showOwnerLink={showOwnerLink}>
      <p style={noteStyle}>Плюшкино, по дням. «Пироги» — всё, кроме кондитерки.</p>
      {rows.length === 0 ? (
        <div style={emptyStyle}>За этот месяц выручки пока нет.</div>
      ) : (
        <div style={{ ...cardStyle, padding: '4px 12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', width: '30%' }}>Дата</th>
                <th style={th}>Пироги</th>
                <th style={th}>Конд.</th>
                <th style={th}>Всего</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '10px 0', fontSize: 14, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                    {r.label} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{r.weekday}</span>
                  </td>
                  <td style={{ ...num, color: PIES }}>{rub(r.other)}</td>
                  <td style={{ ...num, color: CONF_INK }}>{rub(r.confectionery)}</td>
                  <td style={{ ...num, color: 'var(--ink)', fontWeight: 800 }}>{rub(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </StaffPage>
  );
}

const WEEK = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
// На тёмных фонах премий (фиолетовый, красный, чёрный) подпись белая, на светлых — цвет текста.
const LIGHT_TEXT_BONUS = new Set([500, 800, 1200]);
const cellBox: React.CSSProperties = { minHeight: 44, borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.15 };

function DayCell({ cell }: { cell: CalendarCell }) {
  if (cell === null) return <div />;
  const day = <span style={{ fontSize: 13, fontWeight: 700 }}>{cell.day}</span>;
  const note = (text: string) => <span style={{ fontSize: 11, fontWeight: 700 }}>{text}</span>;
  const s = cell.state;
  switch (s.kind) {
    case 'off':
      return <div style={{ ...cellBox, color: '#b4bcb8' }}>{day}</div>;
    case 'planned':
      return <div style={{ ...cellBox, border: `1.5px dashed ${PIES}`, color: PIES }}>{day}{note('план')}</div>;
    case 'pending':
      return <div style={{ ...cellBox, border: '1.5px solid #cfd8d3', color: 'var(--ink)' }}>{day}{note('…')}</div>;
    case 'worked':
      return <div style={{ ...cellBox, background: 'var(--chip)', color: 'var(--ink)' }}>{day}</div>;
    case 'bonus': {
      const bg = s.amount > 0 ? bonusColor(s.amount) : null;
      const color = bg && LIGHT_TEXT_BONUS.has(s.amount) ? '#fff' : 'var(--ink)';
      return <div style={{ ...cellBox, background: bg ?? 'var(--chip)', color }}>{day}{note(`+${s.amount}`)}</div>;
    }
  }
}

function Payout({ p }: { p: PayoutLine }) {
  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
        <span>{p.title}</span>
        <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{rub(p.amount)} ₽</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>
        база {rub(p.base)}
        {p.showBonus ? ` + премии ${rub(p.bonus)}` : ''}
        {p.preliminary && <span style={{ color: '#8a5a12' }}> · предварительно</span>}
      </div>
    </div>
  );
}

function EmployeeCard({ card, showOwnerLink }: { card: EmployeeCardModel; showOwnerLink: boolean }) {
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 };
  return (
    <section id={`emp-${card.id}`} style={{ ...cardStyle, padding: 14, marginBottom: 12, scrollMarginTop: `calc(env(safe-area-inset-top) + ${showOwnerLink ? 124 : 80}px)` }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{card.name}</h2>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>{card.subtitle}</span>
      </div>
      <div style={{ ...grid, marginBottom: 4 }}>
        {WEEK.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{w}</div>
        ))}
      </div>
      <div style={grid}>
        {card.cells.map((c, i) => (
          <DayCell key={c?.date ?? `pad-${i}`} cell={c} />
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        {card.payouts.length === 0 ? (
          <div style={{ paddingTop: 8, borderTop: '1px solid var(--line)', fontSize: 13.5, fontWeight: 600, color: 'var(--muted)' }}>Смен в этом месяце нет.</div>
        ) : (
          <>
            {card.payouts.map((p) => (
              <Payout key={p.half} p={p} />
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--line)', fontSize: 14.5, fontWeight: 800, color: 'var(--profit)' }}>
              <span>За месяц</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{rub(card.monthTotal)} ₽</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function ShiftsView({ month, cards, showOwnerLink }: { month: string; cards: EmployeeCardModel[]; showOwnerLink: boolean }) {
  return (
    <StaffPage tab="shifts" title="Смены и ЗП" month={month} showOwnerLink={showOwnerLink}>
      {cards.length === 0 ? (
        <div style={emptyStyle}>Сотрудников пекарни пока нет.</div>
      ) : (
        <>
          <nav aria-label="Сотрудники" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {cards.map((c) => (
              <a
                key={c.id}
                href={`#emp-${c.id}`}
                style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 999, background: 'var(--card)', border: '1px solid var(--line)', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}
              >
                {c.name}
              </a>
            ))}
          </nav>
          <p style={{ ...noteStyle, marginBottom: 12 }}>
            Премия за смену в день выплаты переходит в следующую выплату — в этот день выручка ещё не известна. Пунктир — смена по графику, «…» — выручку за день ещё не внесли.
          </p>
          {cards.map((c) => (
            <EmployeeCard key={c.id} card={c} showOwnerLink={showOwnerLink} />
          ))}
        </>
      )}
    </StaffPage>
  );
}

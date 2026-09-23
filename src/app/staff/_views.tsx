import type { StaffRevenueRow } from '@/lib/staff/view-model';
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

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FotRow } from '@/lib/db/fot-repo';

const rub = (n: number) => Math.round(n).toLocaleString('ru-RU');

const roleLabel = (r: FotRow['employee']) =>
  r.role === 'baker' ? `пекарь ${r.brigade ?? ''}`.trim() : r.role === 'cashier' ? `кассир ${r.brigade ?? ''}`.trim() : r.role === 'kitchen' ? 'кухня' : 'кондитер';

export function FotGrid({ rows, monthDays, semiMonthly }: { rows: FotRow[]; monthDays: string[]; semiMonthly: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle(employeeId: string, date: string, present: boolean) {
    if (busy) return;
    setBusy(true);
    await fetch('/api/fot/attendance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeId, date, present: !present }) });
    setBusy(false);
    router.refresh();
  }

  const cell: React.CSSProperties = { width: 26, minWidth: 26, textAlign: 'center', padding: '4px 0', borderLeft: '1px solid var(--line)', cursor: 'pointer', userSelect: 'none', fontSize: 12 };
  const head: React.CSSProperties = { fontSize: 10.5, color: 'var(--muted)', fontWeight: 700, padding: '0 0 6px' };
  const numTd: React.CSSProperties = { padding: '4px 8px', textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid var(--line)', whiteSpace: 'nowrap' };
  const numTh: React.CSSProperties = { ...head, textAlign: 'right', paddingLeft: 8 };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...head, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--card)', minWidth: 150 }}>Сотрудник</th>
            {monthDays.map((d) => (
              <th key={d} style={{ ...head, width: 26 }}>{Number(d.slice(8, 10))}</th>
            ))}
            <th style={numTh}>Смен</th>
            {semiMonthly ? (
              <>
                <th style={numTh}>к 15</th>
                <th style={numTh}>2-я пол.</th>
                <th style={numTh}>За месяц</th>
              </>
            ) : (
              <th style={numTh}>За месяц</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employee.id} style={{ borderTop: '1px solid var(--line)' }}>
              <td style={{ padding: '6px 8px 6px 0', position: 'sticky', left: 0, background: 'var(--card)', whiteSpace: 'nowrap' }}>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.employee.name}</span>
                <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>{roleLabel(r.employee)}</span>
              </td>
              {r.days.map((d) => (
                <td
                  key={d.date}
                  style={{ ...cell, background: d.present ? 'rgba(46,125,91,0.12)' : 'transparent', color: d.present ? 'var(--profit)' : 'var(--muted)' }}
                  title={`${d.date} · ${d.present ? rub(d.pay) + ' ₽' : 'выходной'}`}
                  onClick={() => toggle(r.employee.id, d.date, d.present)}
                >
                  {d.present ? '✓' : ''}
                </td>
              ))}
              <td style={{ ...numTd, color: 'var(--ink)' }}>{r.shifts}</td>
              {semiMonthly ? (
                <>
                  <td style={{ ...numTd, color: 'var(--ink)' }}>{rub(r.payTo15)}</td>
                  <td style={{ ...numTd, color: 'var(--ink)' }}>{rub(r.payAfter15)}</td>
                  <td style={{ ...numTd, color: 'var(--profit)' }}>{rub(r.payTotal)}</td>
                </>
              ) : (
                <td style={{ ...numTd, color: 'var(--profit)' }}>{rub(r.payTotal)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { FotPayment, FotRow } from '@/lib/db/fot-repo';
import { bonusColor } from '@/lib/fot/bonus-colors';
import { formatRub as rub, signedRub } from '@/lib/fot/adjustments';
import { FotEditor, type FotEditTarget } from './FotEditor';
import styles from './fot.module.css';

const dm = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;

const roleLabel = (r: FotRow['employee']) =>
  r.role === 'baker' ? `пекарь ${r.brigade ?? ''}`.trim() : r.role === 'cashier' ? `кассир ${r.brigade ?? ''}`.trim() : r.role === 'kitchen' ? 'кухня' : 'кондитер';

export function FotGrid({ rows, monthDays, payouts }: { rows: FotRow[]; monthDays: string[]; payouts: boolean }) {
  const router = useRouter();
  const [editor, setEditor] = useState<FotEditTarget | null>(null);
  const [notice, setNotice] = useState('');
  const [busy, startRefresh] = useTransition();
  const month = monthDays[0].slice(0, 7);

  function saved() {
    setEditor(null);
    setNotice('Изменения сохранены');
    startRefresh(() => router.refresh());
  }

  const cell: React.CSSProperties = { width: 26, minWidth: 26, textAlign: 'center', padding: '4px 0', borderLeft: '1px solid var(--line)', cursor: 'pointer', userSelect: 'none', fontSize: 12 };
  const head: React.CSSProperties = { fontSize: 10.5, color: 'var(--muted)', fontWeight: 700, padding: '0 0 6px' };
  const numTd: React.CSSProperties = { padding: '4px 8px', textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid var(--line)', whiteSpace: 'nowrap' };
  const numTh: React.CSSProperties = { ...head, textAlign: 'right', paddingLeft: 8 };
  const subLine: React.CSSProperties = { fontSize: 10, color: 'var(--muted)', fontWeight: 600, marginTop: 1 };

  // Ячейка выплаты: сумма к выдаче, под ней — дата выплаты этого сотрудника
  // (у бригад A и B она разная) и разбивка «база + премии».
  const payoutCell = (row: FotRow, half: 1 | 2, p: FotPayment | undefined) => (
    <td style={{ ...numTd, color: 'var(--ink)' }}>
      <button type="button" className={styles.paymentButton} disabled={busy}
        aria-label={`${row.employee.name}: изменить ${half}-ю выплату`}
        onClick={() => { setNotice(''); setEditor({ kind: 'payment', employee: row.employee, month, half, payment: p }); }}>
        <strong>{p ? rub(p.amount) : '—'}</strong><small aria-hidden="true">✎</small>
        {p && <>
          <div style={subLine}>{dm(p.payDate)}{p.bonus > 0 ? ` · ${rub(p.base)} + ${rub(p.bonus)}` : ''}</div>
          {p.dayAdjustment !== 0 && <div style={{ ...subLine, color: 'var(--ink)' }}>по дням {signedRub(p.dayAdjustment)}</div>}
          {p.adjustment !== 0 && <div style={{ ...subLine, color: 'var(--ink)' }} title={p.adjustmentNote ?? undefined}>поправка {signedRub(p.adjustment)}</div>}
        </>}
      </button>
    </td>
  );

  return (
    <div>
      <div role="status" className={styles.notice}>{busy ? 'Обновляем расчёт…' : notice}</div>
      <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...head, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--card)', minWidth: 150 }}>Сотрудник</th>
            {monthDays.map((d) => (
              <th key={d} style={{ ...head, width: 26 }}>{Number(d.slice(8, 10))}</th>
            ))}
            <th style={numTh}>Смен</th>
            {payouts ? (
              <>
                <th style={numTh}>1-я выплата</th>
                <th style={numTh}>2-я выплата</th>
                <th style={numTh}>За месяц</th>
              </>
            ) : (
              <th style={numTh}>За месяц</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => {
            const isBonusRole = r.employee.role === 'baker' || r.employee.role === 'cashier';
            const grp = (e: FotRow['employee']) => (e.role === 'kitchen' ? 'k' : e.brigade ?? '-');
            const newGroup = i > 0 && grp(r.employee) !== grp(rows[i - 1].employee);
            return (
            <tr key={r.employee.id} style={{ borderTop: newGroup ? '2px solid #cfd6d2' : '1px solid var(--line)' }}>
              <td style={{ padding: '6px 8px 6px 0', position: 'sticky', left: 0, background: 'var(--card)', whiteSpace: 'nowrap' }}>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.employee.name}</span>
                <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>{roleLabel(r.employee)}</span>
              </td>
              {r.days.map((d) => {
                const bonus = isBonusRole && d.present ? d.bonus : 0;
                const bc = d.present ? bonusColor(bonus) : null;
                const bg = !d.present ? 'transparent' : bc ?? 'rgba(46,125,91,0.12)';
                const tick = !d.present ? 'var(--muted)' : bc ? '#fff' : 'var(--profit)';
                return (
                  <td
                    key={d.date}
                    style={{ ...cell, padding: 0, background: bg, color: tick, boxShadow: d.adjustment !== 0 ? 'inset 0 -2px var(--ink)' : undefined }}
                  >
                    <button type="button" className={styles.dayButton} disabled={busy}
                      aria-label={`${r.employee.name}, ${dm(d.date)}: ${d.present ? 'смена' : 'выходной'}, ${rub(d.pay)} ₽${d.adjustment !== 0 ? `, корректировка ${signedRub(d.adjustment)} ₽` : ''}`}
                      title={`${d.date} · ${rub(d.pay)} ₽${bonus > 0 ? ` · премия ${rub(bonus)}` : ''}${d.adjustment !== 0 ? ` · корректировка ${signedRub(d.adjustment)}` : ''}${d.adjustmentNote ? ` · ${d.adjustmentNote}` : ''} · изменить`}
                      onClick={() => { setNotice(''); setEditor({ kind: 'day', employee: r.employee, day: d }); }}>
                      {d.present ? '✓' : <span aria-hidden="true">·</span>}
                      {d.adjustment !== 0 && <span>{signedRub(d.adjustment)}</span>}
                    </button>
                  </td>
                );
              })}
              <td style={{ ...numTd, color: 'var(--ink)' }}>{r.shifts}</td>
              {payouts ? (
                <>
                  {payoutCell(r, 1, r.payments.find((p) => p.half === 1))}
                  {payoutCell(r, 2, r.payments.find((p) => p.half === 2))}
                  <td style={{ ...numTd, color: 'var(--profit)' }}>{rub(r.paymentsTotal)}</td>
                </>
              ) : (
                <td style={{ ...numTd, color: 'var(--profit)' }}>{rub(r.paymentsTotal)}</td>
              )}
            </tr>
            );
          })}
        </tbody>
      </table>
      </div>
      {editor && <FotEditor target={editor} onClose={() => setEditor(null)} onSaved={saved} />}
    </div>
  );
}

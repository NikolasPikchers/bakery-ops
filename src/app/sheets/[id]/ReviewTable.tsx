'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../../ui.module.css';
import type { SheetView, ViewCell } from '@/lib/db/sheet-view';

type Field = 'prihod' | 'ostatok' | 'spisanie';
type CellKey = string; // `${productId}|${date}|${field}`

const key = (productId: string, date: string, field: Field): CellKey => `${productId}|${date}|${field}`;
const toNum = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
};

export function ReviewTable({ view }: { view: SheetView }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<CellKey, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const confirmed = view.status === 'confirmed';

  const cellValue = (productId: string, date: string, field: Field, cell: ViewCell | undefined): string => {
    const k = key(productId, date, field);
    if (k in edits) return edits[k];
    const v = cell ? cell[field] : null;
    return v == null ? '' : String(v);
  };

  function setCell(productId: string, date: string, field: Field, raw: string) {
    setEdits((prev) => ({ ...prev, [key(productId, date, field)]: raw }));
  }

  async function patch(body: unknown, okMsg: string) {
    setBusy(true);
    setMsg('');
    const res = await fetch(`/api/sheets/${view.sheetId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error ?? 'Ошибка');
      return;
    }
    setMsg(okMsg);
    setEdits({});
    router.refresh();
  }

  function save() {
    // Собираем правки по (товар,дата): берём текущее значение всех трёх полей.
    const touched = new Set(Object.keys(edits).map((k) => k.split('|').slice(0, 2).join('|')));
    const payload = [...touched].map((pd) => {
      const [productId, date] = pd.split('|');
      const cell = view.rows.find((r) => r.productId === productId)?.cells[date];
      return {
        productId,
        date,
        prihod: toNum(cellValue(productId, date, 'prihod', cell)),
        ostatok: toNum(cellValue(productId, date, 'ostatok', cell)),
        spisanie: toNum(cellValue(productId, date, 'spisanie', cell)),
      };
    });
    if (payload.length === 0) {
      setMsg('Нет изменений');
      return;
    }
    patch({ action: 'save', edits: payload }, 'Сохранено');
  }

  return (
    <>
      {msg && <p className={styles.error}>{msg}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th rowSpan={2} className={styles.rowName}>
                Товар
              </th>
              {view.dates.map((d) => (
                <th key={d} colSpan={3}>
                  {d.slice(5)}
                </th>
              ))}
            </tr>
            <tr>
              {view.dates.map((d) => (
                <th key={d} colSpan={3} style={{ fontSize: 11 }}>
                  П / О / С
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.productId}>
                <td className={styles.rowName}>{row.productName}</td>
                {view.dates.flatMap((d) => {
                  const cell = row.cells[d];
                  const low = cell?.low ?? false;
                  return (['prihod', 'ostatok', 'spisanie'] as Field[]).map((field) => (
                    <td
                      key={`${d}|${field}`}
                      className={`${field === 'ostatok' ? styles.cellOstatok : ''} ${low ? styles.cellLow : ''}`}
                    >
                      <input
                        className={styles.cellInput}
                        inputMode="numeric"
                        disabled={confirmed || busy}
                        value={cellValue(row.productId, d, field, cell)}
                        onChange={(e) => setCell(row.productId, d, field, e.target.value)}
                      />
                      {cell?.raw && (
                        <span className={styles.raw}>{cell.raw[field] || '·'}</span>
                      )}
                    </td>
                  ));
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {view.unknownLines.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h3>Новые/нераспознанные строки</h3>
          {view.unknownLines.map((u) => (
            <div key={u.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ flex: 1 }}>
                {u.rawText} <em style={{ color: '#999' }}>({u.status})</em>
              </span>
              {u.status === 'pending' && (
                <>
                  <select
                    defaultValue=""
                    disabled={busy}
                    onChange={(e) =>
                      e.target.value &&
                      patch({ action: 'mapUnknown', id: u.id, productId: e.target.value }, 'Сопоставлено')
                    }
                  >
                    <option value="" disabled>
                      Сопоставить с…
                    </option>
                    {view.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className={`${styles.btn} ${styles.btnGhost}`}
                    disabled={busy}
                    onClick={() => patch({ action: 'ignoreUnknown', id: u.id }, 'Игнорировано')}
                  >
                    Игнор
                  </button>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      {!confirmed && (
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button className={styles.btn} disabled={busy} onClick={save}>
            Сохранить правки
          </button>
          <button
            className={styles.btn}
            disabled={busy}
            onClick={() => patch({ action: 'confirm' }, 'Лист подтверждён')}
          >
            Подтвердить лист
          </button>
        </div>
      )}
    </>
  );
}

'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../ui.module.css';
import { POINTS } from '@/lib/domain/points';
import { EXPENSE_CATEGORIES, categoryLabel } from '@/lib/finance/categories';
import type { FinanceEntryView } from '@/lib/db/finance-repo';

const ruble = (n: number) => `₽ ${n.toLocaleString('ru-RU')}`;

export function FinanceForms({ entries }: { entries: FinanceEntryView[] }) {
  const router = useRouter();
  const [type, setType] = useState<'revenue' | 'expense'>('revenue');
  const [pointId, setPointId] = useState('point-1');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('produkty');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const [impType, setImpType] = useState<'revenue' | 'expense'>('revenue');
  const [impFile, setImpFile] = useState<File | null>(null);
  const [impMsg, setImpMsg] = useState('');

  async function submitEntry(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const amt = Number(amount.replace(',', '.'));
    if (!date || !(amt > 0)) {
      setBusy(false);
      setMsg('Укажите дату и сумму > 0');
      return;
    }
    const body =
      type === 'revenue'
        ? { type, pointId, date, amount: amt, note: note || undefined }
        : { type, pointId, date, amount: amt, category, note: note || undefined };
    const res = await fetch('/api/finance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? 'Ошибка');
      return;
    }
    setMsg('Сохранено');
    setAmount('');
    setNote('');
    router.refresh();
  }

  async function submitImport(e: React.FormEvent) {
    e.preventDefault();
    if (!impFile) {
      setImpMsg('Выберите CSV-файл');
      return;
    }
    setImpMsg('Импорт…');
    const fd = new FormData();
    fd.set('type', impType);
    fd.set('file', impFile);
    const res = await fetch('/api/finance/import', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setImpMsg(data.error ?? 'Ошибка импорта');
      return;
    }
    const errs = (data.errors ?? []) as { line: number; reason: string }[];
    setImpMsg(`Импортировано: ${data.imported}.` + (errs.length ? ` Пропущено строк: ${errs.length} (${errs.map((x) => `стр.${x.line}`).join(', ')})` : ''));
    router.refresh();
  }

  async function remove(item: FinanceEntryView) {
    if (busy) return;
    setBusy(true);
    await fetch(`/api/finance/${item.id}?type=${item.type}`, { method: 'DELETE' });
    setBusy(false);
    router.refresh();
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section className={styles.card} style={{ margin: 0, maxWidth: 'none' }}>
        <h3>Внести запись</h3>
        <form onSubmit={submitEntry} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, alignItems: 'end' }}>
          <div className={styles.field}>
            <label>Тип</label>
            <select value={type} onChange={(e) => setType(e.target.value as 'revenue' | 'expense')}>
              <option value="revenue">Выручка</option>
              <option value="expense">Расход</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>Точка</label>
            <select value={pointId} onChange={(e) => setPointId(e.target.value)}>
              {POINTS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label>Дата</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Сумма, ₽</label>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {type === 'expense' && (
            <div className={styles.field}>
              <label>Категория</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className={styles.field}>
            <label>Заметка</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className={styles.btn} disabled={busy}>Сохранить</button>
        </form>
        {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      </section>

      <section className={styles.card} style={{ margin: 0, maxWidth: 'none' }}>
        <h3>Импорт CSV</h3>
        <p style={{ fontSize: 13, color: '#666' }}>
          Выручка: <code>date,point,amount[,note]</code>. Расходы: <code>date,point,category,amount[,note]</code>.
          Дата ГГГГ-ММ-ДД или ДД.ММ.ГГГГ; точка — Плюшкино/Корица или point-1/point-2.
        </p>
        <form onSubmit={submitImport} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={impType} onChange={(e) => setImpType(e.target.value as 'revenue' | 'expense')}>
            <option value="revenue">Выручка</option>
            <option value="expense">Расходы</option>
          </select>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setImpFile(e.target.files?.[0] ?? null)} />
          <button className={styles.btn}>Импортировать</button>
        </form>
        {impMsg && <p style={{ marginTop: 8 }}>{impMsg}</p>}
      </section>

      <section className={styles.card} style={{ margin: 0, maxWidth: 'none' }}>
        <h3>Последние записи</h3>
        {entries.length === 0 ? (
          <p>Пока нет записей.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Дата</th><th>Точка</th><th>Тип</th><th>Категория</th><th>Сумма</th><th>Источник</th><th></th></tr>
            </thead>
            <tbody>
              {entries.map((it) => (
                <tr key={`${it.type}-${it.id}`}>
                  <td>{it.date}</td>
                  <td>{it.pointName}</td>
                  <td>{it.type === 'revenue' ? 'Выручка' : 'Расход'}</td>
                  <td>{it.category ? categoryLabel(it.category) : '—'}</td>
                  <td>{ruble(it.amount)}</td>
                  <td>{it.source === 'import' ? 'CSV' : 'вручную'}</td>
                  <td><button className={`${styles.btn} ${styles.btnGhost}`} disabled={busy} onClick={() => remove(it)}>Удалить</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}

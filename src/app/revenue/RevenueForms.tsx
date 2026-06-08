'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../ui.module.css';

type UploadResult = { file: string; date: string | null; amount?: number; status: string };
const ruble = (n: number) => `₽ ${Math.round(n).toLocaleString('ru-RU')}`;

export function RevenueForms() {
  const router = useRouter();

  // Плюшкино — загрузка xlsx
  const [files, setFiles] = useState<FileList | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [upMsg, setUpMsg] = useState('');
  const [upRows, setUpRows] = useState<UploadResult[]>([]);

  // Корица — ручной ввод
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [mBusy, setMBusy] = useState(false);
  const [mMsg, setMMsg] = useState('');

  async function uploadXlsx(e: React.FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) {
      setUpMsg('Выберите xlsx-файлы выгрузки из iiko');
      return;
    }
    setUpBusy(true);
    setUpMsg('Загрузка…');
    setUpRows([]);
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append('files', f);
    const res = await fetch('/api/revenue/iiko-upload', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    setUpBusy(false);
    if (!res.ok) {
      setUpMsg(data.error ?? 'Ошибка загрузки');
      return;
    }
    setUpRows(data.results ?? []);
    setUpMsg(`Готово: добавлено ${data.imported}, обновлено ${data.updated}.`);
    router.refresh();
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount.replace(',', '.'));
    if (!from || !(amt > 0)) {
      setMMsg('Укажите дату «с» и сумму > 0');
      return;
    }
    setMBusy(true);
    setMMsg('Сохранение…');
    const res = await fetch('/api/revenue/manual', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ pointId: 'point-2', from, to: to || from, amount: amt }),
    });
    const data = await res.json().catch(() => ({}));
    setMBusy(false);
    if (!res.ok) {
      setMMsg(data.error ?? 'Ошибка');
      return;
    }
    setMMsg(
      data.days > 1
        ? `Записано за ${data.days} дн (по ${ruble(data.perDay)}/день): добавлено ${data.imported}, обновлено ${data.updated}.`
        : `Записано: добавлено ${data.imported}, обновлено ${data.updated}.`,
    );
    setAmount('');
    router.refresh();
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section className={styles.card} style={{ margin: 0, maxWidth: 'none' }}>
        <h3>Плюшкино · загрузка из iiko (xlsx)</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Дневные выгрузки продаж из iiko (по одному файлу на день). Дата берётся из имени файла
          (<code>…_ДД.ММ.ГГ.xlsx</code>), выручка — сумма колонки «…по выручке». Можно выбрать несколько файлов.
        </p>
        <form onSubmit={uploadXlsx} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="file" accept=".xlsx" multiple onChange={(e) => setFiles(e.target.files)} />
          <button className={styles.btn} disabled={upBusy}>Загрузить</button>
        </form>
        {upMsg && <p style={{ marginTop: 8 }}>{upMsg}</p>}
        {upRows.length > 0 && (
          <table className={styles.table} style={{ marginTop: 12 }}>
            <thead>
              <tr><th>Файл</th><th>Дата</th><th>Выручка</th><th>Статус</th></tr>
            </thead>
            <tbody>
              {upRows.map((r, i) => (
                <tr key={i}>
                  <td style={{ maxWidth: 280, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={r.file}>{r.file}</td>
                  <td>{r.date ?? '—'}</td>
                  <td>{r.amount != null ? ruble(r.amount) : '—'}</td>
                  <td>{r.status}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className={styles.card} style={{ margin: 0, maxWidth: 'none' }}>
        <h3>Корица · вручную</h3>
        <p style={{ fontSize: 13, color: 'var(--muted)' }}>
          Один день — заполните только «с». Период (напр. неделя) — «с» и «по»: сумма распределится поровну по дням.
        </p>
        <form onSubmit={submitManual} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, alignItems: 'end' }}>
          <div className={styles.field}>
            <label>Дата с</label>
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Дата по (необяз.)</label>
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Сумма за период, ₽</label>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          <button className={styles.btn} disabled={mBusy}>Сохранить</button>
        </form>
        {mMsg && <p style={{ marginTop: 8 }}>{mMsg}</p>}
      </section>
    </div>
  );
}

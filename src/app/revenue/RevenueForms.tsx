'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHead, Table, btnStyle, headRowStyle, hintStyle, inputStyle, noteStyle, numStyle, rowStyle } from '../_ui';

type UploadResult = { file: string; date: string | null; amount?: number; status: string };
const ruble = (n: number) => `₽ ${Math.round(n).toLocaleString('ru-RU')}`;

/** Поле формы: подпись сверху, поле снизу — в типографике эталонных таблиц. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{label}</span>
      {children}
    </label>
  );
}

export function RevenueForms() {
  const router = useRouter();

  // Плюшкино — синхронизация с iiko
  const [sFrom, setSFrom] = useState('');
  const [sTill, setSTill] = useState('');
  const [sBusy, setSBusy] = useState(false);
  const [sMsg, setSMsg] = useState('');
  const [sOk, setSOk] = useState(false);

  // Плюшкино — загрузка xlsx
  const [files, setFiles] = useState<FileList | null>(null);
  const [upBusy, setUpBusy] = useState(false);
  const [upMsg, setUpMsg] = useState('');
  const [upOk, setUpOk] = useState(false); // сообщение об успехе — зелёное, прочие — приглушённые
  const [upRows, setUpRows] = useState<UploadResult[]>([]);

  // Корица — ручной ввод
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [amount, setAmount] = useState('');
  const [mBusy, setMBusy] = useState(false);
  const [mMsg, setMMsg] = useState('');
  const [mOk, setMOk] = useState(false);

  async function syncIiko(e: React.FormEvent) {
    e.preventDefault();
    if ((sFrom && !sTill) || (!sFrom && sTill)) {
      setSOk(false);
      setSMsg('Укажите обе даты или оставьте обе пустыми');
      return;
    }
    setSBusy(true);
    setSOk(false);
    setSMsg('Запрашиваю iiko…');
    const res = await fetch('/api/revenue/iiko-sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: sFrom ? JSON.stringify({ from: sFrom, till: sTill }) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setSBusy(false);
    if (!res.ok) {
      setSMsg(data.error ?? 'Ошибка синхронизации');
      return;
    }
    setSOk(true);
    setSMsg(`Готово за ${data.from} — ${data.till}: дней с продажами ${data.days}, добавлено ${data.imported}, обновлено ${data.updated}.`);
    router.refresh();
  }

  async function uploadXlsx(e: React.FormEvent) {
    e.preventDefault();
    if (!files || files.length === 0) {
      setUpOk(false);
      setUpMsg('Выберите xlsx-файлы выгрузки из iiko');
      return;
    }
    setUpBusy(true);
    setUpOk(false);
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
    setUpOk(true);
    setUpMsg(`Готово: добавлено ${data.imported}, обновлено ${data.updated}.`);
    router.refresh();
  }

  async function submitManual(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount.replace(',', '.'));
    if (!from || !(amt > 0)) {
      setMOk(false);
      setMMsg('Укажите дату «с» и сумму > 0');
      return;
    }
    setMBusy(true);
    setMOk(false);
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
    setMOk(true);
    setMMsg(
      data.days > 1
        ? `Записано за ${data.days} дн (по ${ruble(data.perDay)}/день): добавлено ${data.imported}, обновлено ${data.updated}.`
        : `Записано: добавлено ${data.imported}, обновлено ${data.updated}.`,
    );
    setAmount('');
    router.refresh();
  }

  return (
    <>
      {/* Синхронизация с iiko (Cloud API) */}
      <Card>
        <CardHead title="Выручка из iiko" meta={<>точка: <b style={{ color: 'var(--ink)' }}>Плюшкино</b></>} mb={6} />
        <p style={{ ...hintStyle, marginBottom: 14 }}>
          Подтягивается сама: при открытии дашборда и каждую ночь — за вчера и сегодня, вместе с кондитеркой.
          Кнопка — обновить прямо сейчас; чтобы перезалить прошлый период, укажите даты (до 31 дня).
        </p>
        <form onSubmit={syncIiko} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Дата с (необяз.)">
            <input type="date" value={sFrom} onChange={(e) => setSFrom(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Дата по (необяз.)">
            <input type="date" value={sTill} onChange={(e) => setSTill(e.target.value)} style={inputStyle} />
          </Field>
          <button type="submit" style={{ ...btnStyle, opacity: sBusy ? 0.6 : 1 }} disabled={sBusy}>{sBusy ? 'Обновляю…' : 'Обновить из iiko'}</button>
          {sMsg && <span style={{ ...noteStyle, color: sOk ? 'var(--profit)' : 'var(--muted)' }}>{sMsg}</span>}
        </form>
      </Card>

      {/* Загрузка выгрузок iiko — запасной путь */}
      <Card>
        <CardHead title="Загрузить выгрузки iiko (xlsx)" meta={<>точка: <b style={{ color: 'var(--ink)' }}>Плюшкино</b></>} mb={6} />
        <p style={{ ...hintStyle, marginBottom: 14 }}>
          Дневные выгрузки продаж из iiko — оба формата: «Табличные данные» и «Категории и блюда».
          Дата берётся из шапки отчёта («Период»), а если её нет — из имени файла
          (<code style={{ background: 'var(--chip)', borderRadius: 6, padding: '1px 5px' }}>…_ДД.ММ.ГГ.xlsx</code>).
          Выручка — колонка «Сумма продажи» / «…по выручке» по строкам-блюдам. Если период в отчёте больше одного
          дня, сумма делится поровну по дням. Можно выбрать несколько файлов.
        </p>
        <form onSubmit={uploadXlsx} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input type="file" accept=".xlsx" multiple onChange={(e) => setFiles(e.target.files)} style={{ fontSize: 14 }} />
          <button type="submit" style={{ ...btnStyle, opacity: upBusy ? 0.6 : 1 }} disabled={upBusy}>{upBusy ? 'Загружаю…' : 'Загрузить'}</button>
          {upMsg && <span style={{ ...noteStyle, color: upOk ? 'var(--profit)' : 'var(--muted)' }}>{upMsg}</span>}
        </form>

        {upRows.length > 0 && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <Table>
              <thead>
                <tr style={headRowStyle}>
                  <th style={{ padding: '0 8px 8px 0' }}>Файл</th>
                  <th style={{ padding: '0 8px 8px' }}>Дата</th>
                  <th style={{ padding: '0 8px 8px', textAlign: 'right' }}>Выручка</th>
                  <th style={{ padding: '0 0 8px 8px' }}>Статус</th>
                </tr>
              </thead>
              <tbody>
                {upRows.map((r, i) => (
                  <tr key={i} style={rowStyle}>
                    <td
                      style={{ padding: '8px 8px 8px 0', maxWidth: 320, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--ink)', fontWeight: 600 }}
                      title={r.file}
                    >
                      {r.file}
                    </td>
                    <td style={{ padding: '8px', whiteSpace: 'nowrap', color: 'var(--muted)', fontWeight: 600 }}>{r.date ?? '—'}</td>
                    <td style={{ padding: '8px', ...numStyle, fontWeight: 800, color: 'var(--ink)' }}>{r.amount != null ? ruble(r.amount) : '—'}</td>
                    <td style={{ padding: '8px 0 8px 8px', color: 'var(--muted)', fontSize: 12.5, fontWeight: 600 }}>{r.status}</td>
                  </tr>
                ))}
              </tbody>
            </Table>
          </div>
        )}
      </Card>

      {/* Ручной ввод по Корице */}
      <Card>
        <CardHead title="Добавить выручку вручную" meta={<>точка: <b style={{ color: 'var(--ink)' }}>Корица</b></>} mb={6} />
        <p style={{ ...hintStyle, marginBottom: 14 }}>
          Один день — заполните только «с». Период (напр. неделя) — «с» и «по»: сумма распределится поровну по дням.
        </p>
        <form onSubmit={submitManual} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Field label="Дата с">
            <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Дата по (необяз.)">
            <input type="date" value={to} onChange={(e) => setTo(e.target.value)} style={inputStyle} />
          </Field>
          <Field label="Сумма за период, ₽">
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} style={{ ...inputStyle, width: 160 }} />
          </Field>
          <button type="submit" style={{ ...btnStyle, opacity: mBusy ? 0.6 : 1 }} disabled={mBusy}>{mBusy ? 'Сохраняю…' : 'Сохранить'}</button>
          {mMsg && <span style={{ ...noteStyle, color: mOk ? 'var(--profit)' : 'var(--muted)' }}>{mMsg}</span>}
        </form>
      </Card>
    </>
  );
}

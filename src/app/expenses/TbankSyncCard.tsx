'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { Card, CardHead, btnStyle, hintStyle, inputStyle, noteStyle } from '../_ui';

type Summary = { from: string; till: string; fetched: number; outgoing: number; imported: number; updated: number };

/** Сообщение после синхронизации — отдельно, чтобы проверить формулировку тестом. */
export function tbankSyncMessage(s: Summary): string {
  return `Готово за ${s.from} — ${s.till}: расходов в банке ${s.outgoing}, добавлено ${s.imported}, уже было ${s.updated}.`;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 6, fontSize: 12, fontWeight: 700, color: 'var(--muted)' }}>
      {label}
      {children}
    </label>
  );
}

/** Расходы из Т-Бизнеса по API: каждую ночь сами, кнопка — сейчас, даты — перезалить период. */
export function TbankSyncCard() {
  const router = useRouter();
  const [from, setFrom] = useState('');
  const [till, setTill] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [ok, setOk] = useState(false);

  async function sync(e: React.FormEvent) {
    e.preventDefault();
    if ((from && !till) || (!from && till)) {
      setOk(false);
      setMsg('Укажите обе даты или оставьте обе пустыми');
      return;
    }
    setBusy(true);
    setOk(false);
    setMsg('Запрашиваю банк…');
    const res = await fetch('/api/expenses/tbank-sync', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: from ? JSON.stringify({ from, till }) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? `Ошибка синхронизации (${res.status})`);
      return;
    }
    setOk(true);
    setMsg(tbankSyncMessage(data as Summary));
    router.refresh();
  }

  return (
    <Card>
      <CardHead title="Расходы из Т-Бизнеса" meta={<>точка: <b style={{ color: 'var(--ink)' }}>Плюшкино</b></>} mb={6} />
      <p style={{ ...hintStyle, marginBottom: 14 }}>
        Подтягиваются сами каждую ночь — за последние 7 дней: банк проводит часть операций с опозданием.
        Категории — как при загрузке выписки, переводы себе исключаются, дублей с уже загруженным нет.
        Кнопка — обновить прямо сейчас; чтобы перезалить прошлый период, укажите даты (до 93 дней).
      </p>
      <form onSubmit={sync} style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <Field label="Дата с (необяз.)">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} style={inputStyle} />
        </Field>
        <Field label="Дата по (необяз.)">
          <input type="date" value={till} onChange={(e) => setTill(e.target.value)} style={inputStyle} />
        </Field>
        <button type="submit" style={{ ...btnStyle, opacity: busy ? 0.6 : 1 }} disabled={busy}>
          {busy ? 'Обновляю…' : 'Обновить из банка'}
        </button>
        {msg && <span style={{ ...noteStyle, color: ok ? 'var(--profit)' : 'var(--muted)' }}>{msg}</span>}
      </form>
    </Card>
  );
}

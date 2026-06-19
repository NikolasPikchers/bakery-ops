'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { EXPENSE_CATEGORIES, categoryLabel } from '@/lib/finance/categories';
import type { ExpenseListItem } from '@/lib/db/finance-repo';

const rub = (n: number) => '₽ ' + Math.round(n).toLocaleString('ru-RU');
const SESSION_EXPIRED = 'Сессия истекла — выйдите и войдите заново, затем повторите.';

const CAT_COLOR: Record<string, string> = {
  produkty: '#2e7d5b',
  arenda: '#e0a458',
  fot: '#5b8def',
  kommunalka: '#c0392b',
  nalogi: '#9b59b6',
  investicii: '#14b8a6',
  prochee: '#9aa5a0',
};

type ImportResult = {
  summary: { fetched: number; outgoing: number; imported: number; updated: number };
  preview: {
    fetched: number;
    incoming: number;
    excludedTransfers: number;
    outgoing: number;
    sum: number;
    needsReview: number;
    byCategory: { category: string; count: number; sum: number }[];
  };
  skippedNoDate: number;
};

const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 22, marginBottom: 18 };

export function ExpensesClient({ expenses, total, today }: { expenses: ExpenseListItem[]; total: number; today: string }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [rowBusy, setRowBusy] = useState<string | null>(null);

  // Ручное добавление расхода
  const [amount, setAmount] = useState('');
  const [addCat, setAddCat] = useState('produkty');
  const [addDate, setAddDate] = useState(today);
  const [addBusy, setAddBusy] = useState(false);
  const [addMsg, setAddMsg] = useState('');

  async function addExpense(e: React.FormEvent) {
    e.preventDefault();
    const amt = Number(amount.replace(/\s/g, '').replace(',', '.'));
    if (!(amt > 0)) {
      setAddMsg('Введите сумму больше 0');
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(addDate)) {
      setAddMsg('Укажите дату');
      return;
    }
    setAddBusy(true);
    setAddMsg('');
    const res = await fetch('/api/finance', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ type: 'expense', pointId: 'point-1', date: addDate, amount: amt, category: addCat }),
    });
    setAddBusy(false);
    if (res.status === 401) {
      setAddMsg(SESSION_EXPIRED);
      return;
    }
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setAddMsg(`Ошибка: ${d.error ?? res.status}`);
      return;
    }
    setAmount('');
    setAddMsg('Добавлено');
    router.refresh();
  }

  async function upload(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setMsg('Выберите файл выписки (.csv или .zip)');
      return;
    }
    setBusy(true);
    setMsg('Импортирую…');
    setResult(null);
    const fd = new FormData();
    fd.set('file', file);
    const res = await fetch('/api/expenses/import-statement', { method: 'POST', body: fd });
    setBusy(false);
    if (res.status === 401) {
      setMsg(SESSION_EXPIRED);
      return;
    }
    const data = await res.json().catch(() => null);
    if (!res.ok || !data) {
      setMsg(data?.error ?? `Ошибка импорта (${res.status})`);
      return;
    }
    if (!data.summary || !data.preview) {
      setMsg('Неожиданный ответ сервера. Обновите страницу и попробуйте снова.');
      return;
    }
    setResult(data as ImportResult);
    setMsg('');
    setFile(null);
    if (fileRef.current) fileRef.current.value = '';
    router.refresh();
  }

  async function changeCategory(id: string, category: string) {
    setRowBusy(id);
    const res = await fetch(`/api/finance/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ category }) });
    setRowBusy(null);
    if (res.status === 401) {
      setMsg(SESSION_EXPIRED);
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(`Не удалось сменить категорию: ${data.error ?? res.status}`);
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    if (!window.confirm('Удалить расход?')) return;
    setRowBusy(id);
    const res = await fetch(`/api/finance/${id}?type=expense`, { method: 'DELETE' });
    setRowBusy(null);
    if (res.status === 401) {
      setMsg(SESSION_EXPIRED);
      return;
    }
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setMsg(`Не удалось удалить: ${data.error ?? res.status}`);
      return;
    }
    router.refresh();
  }

  const btn: React.CSSProperties = { padding: '9px 16px', borderRadius: 10, border: 'none', background: 'var(--profit)', color: '#fff', fontWeight: 700, fontSize: 14, cursor: 'pointer' };

  const input: React.CSSProperties = { fontSize: 14, fontWeight: 600, color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 10, padding: '9px 11px' };

  return (
    <>
      {/* Добавить расход вручную */}
      <section style={card}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 12 }}>Добавить расход вручную</div>
        <form onSubmit={addExpense} style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Сумма, ₽"
            style={{ ...input, width: 140 }}
          />
          <select value={addCat} onChange={(e) => setAddCat(e.target.value)} style={input}>
            {EXPENSE_CATEGORIES.map((c) => (
              <option key={c.key} value={c.key}>{c.label}</option>
            ))}
          </select>
          <input type="date" value={addDate} onChange={(e) => setAddDate(e.target.value)} style={input} />
          <button type="submit" style={{ ...btn, opacity: addBusy ? 0.6 : 1 }} disabled={addBusy}>{addBusy ? 'Добавляю…' : 'Добавить'}</button>
          {addMsg && <span style={{ fontSize: 13, color: addMsg === 'Добавлено' ? 'var(--profit)' : 'var(--muted)', fontWeight: 600 }}>{addMsg}</span>}
        </form>
        <p style={{ fontSize: 12, color: 'var(--muted)', fontWeight: 600, margin: '10px 0 0' }}>
          Расход идёт на <b>Плюшкино</b>, дата по умолчанию — сегодня. Аренда и коммуналка считаются фиксом (125 000/мес), поэтому такие записи в дашборде не учитываются.
        </p>
      </section>

      {/* Загрузка выписки */}
      <section style={card}>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)', marginBottom: 6 }}>Загрузить выписку Т-Банка</div>
        <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, marginTop: 0, marginBottom: 14, lineHeight: 1.5 }}>
          Т-Бизнес → счёт → <b>Выписка</b> → скачать в формате <b>CSV</b> (или .zip с CSV). Загрузи файл сюда — расходы сами
          разнесутся по категориям (по ИНН/назначению), переводы себе исключатся. Все расходы идут на <b>Плюшкино</b>.
          Повторная загрузка того же файла не создаёт дублей.
        </p>
        <form onSubmit={upload} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,.zip,text/csv,application/zip"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            style={{ fontSize: 14 }}
          />
          <button type="submit" style={{ ...btn, opacity: busy ? 0.6 : 1 }} disabled={busy}>{busy ? 'Импорт…' : 'Импортировать'}</button>
          {msg && <span style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{msg}</span>}
        </form>

        {result && (
          <div style={{ marginTop: 16, borderTop: '1px solid var(--line)', paddingTop: 14 }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', marginBottom: 10 }}>
              Импортировано новых: <span style={{ color: 'var(--profit)' }}>{result.summary.imported}</span>
              {result.summary.updated > 0 && <> · обновлено: {result.summary.updated}</>}
              {' · '}расходов в файле: {result.preview.outgoing} на {rub(result.preview.sum)}
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, marginBottom: 12, display: 'flex', gap: 14, flexWrap: 'wrap' }}>
              <span>пополнений пропущено: {result.preview.incoming}</span>
              <span>переводов себе исключено: {result.preview.excludedTransfers}</span>
              {result.skippedNoDate > 0 && <span style={{ color: 'var(--expense)' }}>без даты пропущено: {result.skippedNoDate}</span>}
              {result.preview.needsReview > 0 && <span style={{ color: '#e0a458' }}>в «прочее» (проверь): {result.preview.needsReview}</span>}
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {result.preview.byCategory.map((b) => (
                <span key={b.category} style={{ display: 'inline-flex', alignItems: 'center', gap: 7, background: 'var(--bg)', borderRadius: 999, padding: '5px 11px', fontSize: 12.5, fontWeight: 700, color: 'var(--ink)' }}>
                  <span style={{ width: 9, height: 9, borderRadius: 3, background: CAT_COLOR[b.category] ?? '#9aa5a0' }} />
                  {categoryLabel(b.category)} · {rub(b.sum)} <span style={{ color: 'var(--muted)', fontWeight: 600 }}>({b.count})</span>
                </span>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Список расходов за месяц */}
      <section style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Расходы за месяц</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>
            записей: <b style={{ color: 'var(--ink)' }}>{expenses.length}</b> · итого: <b style={{ color: 'var(--expense)' }}>{rub(total)}</b>
          </div>
        </div>

        {expenses.length === 0 ? (
          <p style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600 }}>За этот месяц расходов нет. Загрузи выписку выше.</p>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13.5 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--muted)', fontSize: 11, fontWeight: 700 }}>
                  <th style={{ padding: '0 8px 8px 0' }}>Дата</th>
                  <th style={{ padding: '0 8px 8px' }}>Контрагент / назначение</th>
                  <th style={{ padding: '0 8px 8px' }}>Категория</th>
                  <th style={{ padding: '0 0 8px 8px', textAlign: 'right' }}>Сумма</th>
                  <th style={{ padding: '0 0 8px 8px' }}>Источник</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {expenses.map((e) => (
                  <tr key={e.id} style={{ borderTop: '1px solid var(--line)', opacity: rowBusy === e.id ? 0.5 : 1 }}>
                    <td style={{ padding: '8px 8px 8px 0', whiteSpace: 'nowrap', color: 'var(--ink)', fontWeight: 600 }}>{e.date.slice(8, 10)}.{e.date.slice(5, 7)}</td>
                    <td style={{ padding: '8px', maxWidth: 360 }}>
                      <div style={{ color: 'var(--ink)', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.counterparty ?? '—'}</div>
                      {e.note && <div style={{ color: 'var(--muted)', fontSize: 11.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{e.note}</div>}
                    </td>
                    <td style={{ padding: '8px' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>
                        <span style={{ width: 9, height: 9, borderRadius: 3, background: CAT_COLOR[e.category] ?? '#9aa5a0', flexShrink: 0 }} />
                        <select
                          value={e.category}
                          disabled={rowBusy === e.id}
                          onChange={(ev) => changeCategory(e.id, ev.target.value)}
                          style={{ fontSize: 13, fontWeight: 600, color: 'var(--ink)', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 8, padding: '4px 6px' }}
                        >
                          {EXPENSE_CATEGORIES.map((c) => (
                            <option key={c.key} value={c.key}>{c.label}</option>
                          ))}
                        </select>
                      </span>
                    </td>
                    <td style={{ padding: '8px 0 8px 8px', textAlign: 'right', fontWeight: 800, color: 'var(--ink)', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{rub(e.amount)}</td>
                    <td style={{ padding: '8px 0 8px 8px', color: 'var(--muted)', fontSize: 12, whiteSpace: 'nowrap' }}>{e.source === 'tbusiness' ? 'выписка' : e.source === 'import' ? 'CSV' : 'вручную'}</td>
                    <td style={{ padding: '8px 0 8px 8px', textAlign: 'right' }}>
                      <button
                        onClick={() => remove(e.id)}
                        disabled={rowBusy === e.id}
                        title="Удалить"
                        style={{ border: 'none', background: 'transparent', color: 'var(--muted)', cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: 4 }}
                      >
                        ×
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

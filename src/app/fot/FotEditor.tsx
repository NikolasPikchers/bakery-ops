'use client';

import { useEffect, useRef, useState } from 'react';
import type { FotDay, FotEmployee, FotPayment } from '@/lib/db/fot-repo';
import { formatRub, parseAdjustmentAmount, signedRub } from '@/lib/fot/adjustments';
import styles from './fot.module.css';

export type FotEditTarget =
  | { kind: 'day'; employee: FotEmployee; day: FotDay }
  | { kind: 'payment'; employee: FotEmployee; month: string; half: 1 | 2; payment?: FotPayment };

export function FotEditor({ target, onClose, onSaved }: { target: FotEditTarget; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const amountInput = useRef<HTMLInputElement>(null);
  const original = target.kind === 'day' ? target.day : target.payment;
  const [amount, setAmount] = useState(String(original?.adjustment ?? 0));
  const [note, setNote] = useState(original?.adjustmentNote ?? '');
  const [present, setPresent] = useState(target.kind === 'day' && target.day.present);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const inFlight = useRef(false);
  const parsedAmount = parseAdjustmentAmount(amount);
  const base = target.kind === 'day' ? (present ? target.employee.basePay : 0) : target.payment?.base ?? 0;
  const bonus = target.kind === 'day' ? (present ? target.day.bonus : 0) : target.payment?.bonus ?? 0;
  const dayAdjustment = target.kind === 'payment' ? target.payment?.dayAdjustment ?? 0 : 0;
  const total = Math.round((base + bonus + dayAdjustment + (parsedAmount ?? 0)) * 100) / 100;
  const title = target.kind === 'day'
    ? `Оплата за ${target.day.date.split('-').reverse().join('.')}`
    : `${target.half}-я выплата · ${target.month.split('-').reverse().join('.')}`;

  useEffect(() => {
    dialog.current?.showModal();
    amountInput.current?.focus();
    amountInput.current?.select();
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || parsedAmount === null) return;
    inFlight.current = true;
    setSaving(true);
    setError('');
    const body = {
      employeeId: target.employee.id, amount: parsedAmount, note,
      ...(target.kind === 'day'
        ? { kind: 'day', date: target.day.date, ...(present === target.day.present ? {} : { present }) }
        : { kind: 'payment', month: target.month, half: target.half }),
    };
    try {
      const response = await fetch('/api/fot/adjustments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? 'Не удалось сохранить изменения. Попробуйте ещё раз.');
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Нет соединения. Попробуйте ещё раз.');
    } finally {
      inFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="fot-editor-title" aria-describedby="fot-editor-person"
      onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}>
      <form onSubmit={save}>
        <div className={styles.dialogHeader}>
          <div>
            <h2 id="fot-editor-title">{title}</h2>
            <p id="fot-editor-person">{target.employee.name}</p>
          </div>
          <button type="button" className={styles.close} aria-label="Закрыть" disabled={saving} onClick={onClose}>×</button>
        </div>
        {target.kind === 'day' && (
          <label className={styles.attendance}>
            <input type="checkbox" checked={present} disabled={saving} onChange={(event) => setPresent(event.target.checked)} />
            Выход на смену
          </label>
        )}
        <div className={styles.breakdown}>
          <div><span>Оклад{target.kind === 'payment' ? ' за смены' : ' за день'}</span><b>{formatRub(base)} ₽</b></div>
          <div><span>Премия{target.kind === 'payment' ? ' по расчёту' : ' от выручки'}</span><b>{formatRub(bonus)} ₽</b></div>
          {target.kind === 'payment' && <div><span>Корректировки по дням</span><b>{signedRub(dayAdjustment)} ₽</b></div>}
        </div>
        <label className={styles.field}>
          <span>Доплата / удержание, ₽</span>
          <input ref={amountInput} type="text" inputMode="text" value={amount} disabled={saving} maxLength={14}
            aria-describedby="fot-amount-help" aria-invalid={parsedAmount === null}
            onFocus={(event) => event.currentTarget.select()}
            onChange={(event) => setAmount(event.target.value)} />
        </label>
        <p className={styles.hint} id="fot-amount-help">Со знаком: +200 — добавить, -200 — убавить. 0 — убрать корректировку. Можно указать копейки.</p>
        {parsedAmount === null && <p role="alert" className={styles.error}>Введите число со знаком и не более чем двумя знаками после запятой.</p>}
        <div className={styles.quickAmounts}>
          {[-200, 200].map((change) => <button key={change} type="button" disabled={saving}
            onClick={() => setAmount(String(Math.round(((parsedAmount ?? 0) + change) * 100) / 100))}>{change > 0 ? '+200 ₽' : '−200 ₽'}</button>)}
          <button type="button" disabled={saving} onClick={() => { setAmount('0'); setNote(''); }}>Сбросить</button>
        </div>
        <label className={styles.field}>
          <span>Комментарий <small>необязательно</small></span>
          <input type="text" value={note} disabled={saving} maxLength={300} placeholder="Например, доплата за подмену" onChange={(event) => setNote(event.target.value)} />
        </label>
        <div className={styles.total}><span>{target.kind === 'day' ? 'Итого за день' : 'Итого к выплате'}</span><strong>{parsedAmount === null ? '—' : `${formatRub(total)} ₽`}</strong></div>
        <p className={styles.hint}>{target.kind === 'day' ? 'Корректировка за день входит в выплату за эту половину месяца. Снятие смены не удаляет её — для этого укажите 0.' : 'Эта поправка прибавляется к расчёту выплаты отдельно от корректировок по дням.'}</p>
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" disabled={saving} onClick={onClose}>Отмена</button>
          <button type="submit" className={styles.primary} disabled={saving || parsedAmount === null}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </form>
    </dialog>
  );
}

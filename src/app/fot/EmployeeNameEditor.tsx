'use client';

import { useEffect, useRef, useState } from 'react';
import type { FotEmployee } from '@/lib/db/fot-repo';
import { isValidEmployeeName, MAX_EMPLOYEE_NAME_LENGTH, normalizeEmployeeName } from '@/lib/fot/employee-name';
import styles from './fot.module.css';

export function EmployeeNameEditor({ employee, onClose, onSaved }: { employee: FotEmployee; onClose: () => void; onSaved: () => void }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const inFlight = useRef(false);
  const [name, setName] = useState(employee.name);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const valid = isValidEmployeeName(name);

  useEffect(() => {
    dialog.current?.showModal();
    input.current?.focus();
    input.current?.select();
  }, []);

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (inFlight.current || !valid) return;
    inFlight.current = true;
    setSaving(true);
    setError('');
    try {
      const response = await fetch(`/api/fot/employees/${encodeURIComponent(employee.id)}`, {
        method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: normalizeEmployeeName(name) }),
      });
      if (!response.ok) {
        const data = await response.json().catch(() => null);
        throw new Error(data?.error ?? 'Не удалось сохранить имя. Попробуйте ещё раз.');
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
    <dialog ref={dialog} className={styles.dialog} aria-labelledby="employee-name-title" aria-describedby="employee-name-description"
      onCancel={(event) => { event.preventDefault(); if (!saving) onClose(); }}>
      <form onSubmit={save}>
        <div className={styles.dialogHeader}>
          <div><h2 id="employee-name-title">Имя сотрудника</h2><p>{employee.name}</p></div>
          <button type="button" className={styles.close} aria-label="Закрыть" disabled={saving} onClick={onClose}>×</button>
        </div>
        <label className={styles.field}>
          <span>Имя</span>
          <input ref={input} type="text" value={name} maxLength={MAX_EMPLOYEE_NAME_LENGTH} disabled={saving} required autoComplete="off"
            aria-invalid={!valid} aria-describedby="employee-name-description" onChange={(event) => { setName(event.target.value); setError(''); }} />
        </label>
        <p id="employee-name-description" className={styles.hint}>Новое имя будет видно в ФОТ и на странице сотрудников, в том числе за прошлые месяцы.</p>
        {!valid && <p className={styles.error}>Введите имя от 1 до 100 символов.</p>}
        {error && <p role="alert" className={styles.error}>{error}</p>}
        <div className={styles.actions}>
          <button type="button" disabled={saving} onClick={onClose}>Отмена</button>
          <button type="submit" className={styles.primary} disabled={saving || !valid}>{saving ? 'Сохраняем…' : 'Сохранить'}</button>
        </div>
      </form>
    </dialog>
  );
}

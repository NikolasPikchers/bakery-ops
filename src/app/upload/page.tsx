'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../ui.module.css';

export default function UploadPage() {
  const router = useRouter();
  const [pointId, setPointId] = useState('point-1');
  const [sheetType, setSheetType] = useState('pies');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Выберите фото листа');
      return;
    }
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.set('pointId', pointId);
    fd.set('sheetType', sheetType);
    fd.set('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? 'Ошибка загрузки');
      return;
    }
    router.push(`/sheets/${data.sheetId}`);
  }

  return (
    <main className={styles.shell}>
      <h1>Загрузить лист</h1>
      <form onSubmit={submit} style={{ maxWidth: 420 }}>
        <div className={styles.field}>
          <label>Точка</label>
          <select value={pointId} onChange={(e) => setPointId(e.target.value)}>
            <option value="point-1">Плюшкино</option>
            <option value="point-2">Корица</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>Тип листа</label>
          <select value={sheetType} onChange={(e) => setSheetType(e.target.value)}>
            <option value="pies">Пироги/выпечка</option>
            <option value="desserts">Десерты</option>
            <option value="confectionery_freeform">Кондитерка (рукопись)</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>Фото листа</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <button className={styles.btn} disabled={busy}>
          {busy ? 'Распознаю…' : 'Загрузить и распознать'}
        </button>
      </form>
    </main>
  );
}

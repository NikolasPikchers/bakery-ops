import { notFound } from 'next/navigation';
import { getPrisma } from '@/lib/db/client';
import { loadSheetView } from '@/lib/db/sheet-view';
import { ReviewTable } from './ReviewTable';
import styles from '../../ui.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; cls: string }> = {
  recognized: { label: 'Распознан', cls: styles.badgeRecognized },
  needs_review: { label: 'На проверке', cls: styles.badgeReview },
  confirmed: { label: 'Подтверждён', cls: styles.badgeConfirmed },
  uploaded: { label: 'Загружен', cls: styles.badgeRecognized },
};

export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadSheetView(getPrisma(), id);
  if (!view) notFound();

  const st = STATUS[view.status] ?? { label: view.status, cls: styles.badgeRecognized };

  return (
    <main className={styles.shell}>
      <h1>
        {view.pointName} · {view.sheetType}{' '}
        <span className={`${styles.badge} ${st.cls}`}>{st.label}</span>
      </h1>
      <p>
        Колонка «Остаток» (О) выделена жёлтым; ячейки с низкой уверенностью — оранжевой рамкой. Под каждым
        полем — исходный текст с листа.
      </p>
      <details style={{ margin: '12px 0' }}>
        <summary>Фото листа</summary>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={view.imageUrl} alt="Лист" style={{ maxWidth: '100%', marginTop: 8 }} />
      </details>
      <ReviewTable view={view} />
    </main>
  );
}

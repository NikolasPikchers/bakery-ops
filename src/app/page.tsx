import Link from 'next/link';
import { getPrisma } from '@/lib/db/client';
import styles from './ui.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Загружен',
  recognized: 'Распознан',
  needs_review: 'На проверке',
  confirmed: 'Подтверждён',
};

function badgeClass(status: string): string {
  if (status === 'confirmed') return styles.badgeConfirmed;
  if (status === 'needs_review') return styles.badgeReview;
  return styles.badgeRecognized;
}

export default async function Home() {
  const prisma = getPrisma();
  const sheets = await prisma.sheet.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { point: true },
  });

  return (
    <main className={styles.shell}>
      <h1>Листы</h1>
      <p>
        <Link className={styles.btn} href="/upload">
          + Загрузить лист
        </Link>
      </p>
      {sheets.length === 0 ? (
        <p>Пока нет загруженных листов.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Точка</th>
              <th>Тип</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((s) => (
              <tr key={s.id}>
                <td>{s.createdAt.toISOString().slice(0, 10)}</td>
                <td>{s.point.name}</td>
                <td>{s.sheetType}</td>
                <td>
                  <span className={`${styles.badge} ${badgeClass(s.status)}`}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </td>
                <td>
                  <Link href={`/sheets/${s.id}`}>Открыть</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}

import { getPrisma } from '@/lib/db/client';
import { listFinanceEntries } from '@/lib/db/finance-repo';
import { FinanceForms } from './FinanceForms';
import styles from '../ui.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function FinancePage() {
  const entries = await listFinanceEntries(getPrisma(), 50);
  return (
    <main className={styles.shell}>
      <h1>Финансы</h1>
      <p>Выручка (iiko) и расходы (Т-Бизнес) вносятся вручную или импортом CSV. Чистая прибыль считается на дашборде.</p>
      <FinanceForms entries={entries} />
    </main>
  );
}

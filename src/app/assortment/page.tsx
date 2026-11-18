import Link from 'next/link';
import { parseMonths, PERIOD_MONTHS, type PeriodMonths } from '@/lib/assortment/period';
import { Card, Empty, PageHeader, pageStyle } from '../_ui';
import { AssortmentClient } from './AssortmentClient';
import { ddmm, ddmmyyyy } from './format';
import { loadAssortment } from './load';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function PeriodNav({ months }: { months: PeriodMonths }) {
  return (
    <div style={{ display: 'flex', gap: 4, background: 'var(--card)', padding: 5, borderRadius: 12, border: '1px solid var(--line)' }}>
      {PERIOD_MONTHS.map((m) => {
        const active = m === months;
        return (
          <Link
            key={m}
            href={`/assortment?months=${m}`}
            style={{ padding: '7px 13px', borderRadius: 8, fontSize: 13.5, fontWeight: 700, color: active ? '#fff' : 'var(--muted)', background: active ? 'var(--brand)' : 'transparent' }}
          >
            {m} мес
          </Link>
        );
      })}
    </div>
  );
}

export default async function AssortmentPage({ searchParams }: { searchParams: Promise<{ months?: string }> }) {
  const months = parseMonths((await searchParams).months);
  const view = await loadAssortment(months);
  return (
    <div style={pageStyle}>
      <PageHeader
        title="Ассортимент"
        subtitle={`Плюшкино · продажи по позициям из iiko · ${ddmm(view.from)}–${ddmmyyyy(view.till)}`}
        right={<PeriodNav months={months} />}
      />
      {view.items.length === 0 ? (
        <Card>
          <Empty>Продаж по позициям ещё нет — они появятся после ночной загрузки из iiko.</Empty>
        </Card>
      ) : (
        <AssortmentClient view={view} />
      )}
    </div>
  );
}

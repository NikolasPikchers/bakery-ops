import { PageHeader, pageStyle } from '../_ui';
import { RevenueForms } from './RevenueForms';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default function RevenuePage() {
  return (
    <div style={pageStyle}>
      <PageHeader title="Выручка" subtitle="Плюшкино — выгрузки из iiko, Корица — вручную" />
      <RevenueForms />
    </div>
  );
}

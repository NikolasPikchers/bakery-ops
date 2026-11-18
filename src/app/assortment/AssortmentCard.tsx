import Link from 'next/link';
import type { AssortmentView } from '@/lib/assortment/analyze';
import { cardStyle } from '../_ui';
import { percent } from './format';

/** Карточка на главном дашборде: коротко и ссылкой на «Ассортимент». Без данных — не показываем. */
export function AssortmentCard({ view }: { view: AssortmentView | null }) {
  if (!view || view.items.length === 0) return null;
  const b = (s: string | number) => <b style={{ color: 'var(--ink)' }}>{s}</b>;
  return (
    <Link
      href="/assortment"
      style={{ ...cardStyle, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap', marginTop: 18 }}
    >
      <div>
        <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Ассортимент</div>
        <div style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600, marginTop: 3 }}>Плюшкино · последние 3 месяца</div>
      </div>
      <div style={{ fontSize: 14, color: 'var(--muted)', fontWeight: 600 }}>
        в продаже {b(view.counts.onSale)} · кандидатов на сокращение {b(view.counts.C)} ({percent(view.abcShare.C)} выручки){' '}
        <span style={{ color: 'var(--profit)', fontWeight: 800 }}>→</span>
      </div>
    </Link>
  );
}

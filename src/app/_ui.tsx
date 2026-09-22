// Общий язык оформления вкладок. Эталон — вкладка «Расходы»: белые карточки с мягкой тенью
// на сером фоне, шапка «заголовок + навигация по месяцам», подзаголовки секций 17/800,
// таблицы с тонкими разделителями, поля и кнопки одного размера.
// Всё, что лежит здесь, обязано выглядеть ровно так же, как на «Расходах».
import Link from 'next/link';
import { monthLabel, nextMonth, prevMonth } from '@/lib/finance/month';

/** Отступы страницы (одинаковые на всех вкладках). */
export const pageStyle: React.CSSProperties = { padding: '24px 28px' };

/** Карточка: белый блок с мягкой тенью и крупным радиусом. */
export const cardStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--line)',
  borderRadius: 'var(--radius)',
  boxShadow: 'var(--shadow)',
  padding: 22,
};

/** Поле ввода (input/select). */
export const inputStyle: React.CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: 'var(--ink)',
  background: 'var(--card)',
  border: '1px solid var(--line)',
  borderRadius: 10,
  padding: '9px 11px',
};

/** Основная кнопка (зелёная). */
export const btnStyle: React.CSSProperties = {
  padding: '9px 16px',
  borderRadius: 10,
  border: 'none',
  background: 'var(--profit)',
  color: '#fff',
  fontWeight: 700,
  fontSize: 14,
  cursor: 'pointer',
};

/** Пояснение под заголовком секции. */
export const hintStyle: React.CSSProperties = { fontSize: 13, color: 'var(--muted)', fontWeight: 600, lineHeight: 1.5 };

/** Короткое сообщение рядом с кнопкой формы. */
export const noteStyle: React.CSSProperties = { fontSize: 13, fontWeight: 600, color: 'var(--muted)' };

/** Строка-шапка таблицы. */
export const headRowStyle: React.CSSProperties = { textAlign: 'left', color: 'var(--muted)', fontSize: 11, fontWeight: 700 };

/** Разделитель между строками таблицы. */
export const rowStyle: React.CSSProperties = { borderTop: '1px solid var(--line)' };

/** Числовая ячейка: вправо, моноширинные цифры, без переноса. */
export const numStyle: React.CSSProperties = { textAlign: 'right', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

/** Сетка KPI-плиток: сама складывается в один столбец на узком экране. */
export const kpiGridStyle: React.CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fit,minmax(170px,1fr))',
  gap: 16,
  marginBottom: 18,
};

/** Шапка страницы: заголовок (+подзаголовок) слева, навигация или действия справа. */
export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>{title}</h1>
        {subtitle && <p style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600, marginTop: 2 }}>{subtitle}</p>}
      </div>
      {right}
    </div>
  );
}

/** Переключатель месяца: ‹ Июнь 2026 ›. `href` строит ссылку для месяца. */
export function MonthNav({ month, href }: { month: string; href: (m: string) => string }) {
  const arrow: React.CSSProperties = { width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 17 };
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card)', padding: '6px 8px', borderRadius: 12, border: '1px solid var(--line)' }}>
      <Link href={href(prevMonth(month))} style={arrow}>‹</Link>
      <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', minWidth: 110, textAlign: 'center' }}>{monthLabel(month)}</span>
      <Link href={href(nextMonth(month))} style={arrow}>›</Link>
    </div>
  );
}

/** Карточка-секция: по умолчанию с отступом снизу, как на «Расходах». */
export function Card({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <section style={{ ...cardStyle, marginBottom: 18, ...style }}>{children}</section>;
}

/** Заголовок секции внутри карточки + необязательная сводка справа. `mb` — отступ до содержимого. */
export function CardHead({ title, meta, mb = 12 }: { title: React.ReactNode; meta?: React.ReactNode; mb?: number }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: mb, gap: 12, flexWrap: 'wrap' }}>
      <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{title}</div>
      {meta && <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>{meta}</div>}
    </div>
  );
}

/** Таблица в контейнере с горизонтальным скроллом — на узком экране не разъезжается. */
export function Table({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%', fontSize: 13.5 }}>{children}</table>
    </div>
  );
}

/** Пустое состояние внутри карточки. */
export function Empty({ children }: { children: React.ReactNode }) {
  return <p style={{ fontSize: 13.5, color: 'var(--muted)', fontWeight: 600 }}>{children}</p>;
}

/** KPI-плитка: подпись капсом, крупное значение, необязательная сноска. */
export function Kpi({ label, value, color, sub }: { label: string; value: string; color?: string; sub?: string }) {
  return (
    <div style={{ ...cardStyle, display: 'flex', flexDirection: 'column', gap: 6 }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--muted)' }}>{label}</span>
      <span style={{ fontSize: 24, fontWeight: 800, letterSpacing: '-0.02em', color: color ?? 'var(--ink)', fontVariantNumeric: 'tabular-nums' }}>{value}</span>
      {sub && <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{sub}</span>}
    </div>
  );
}

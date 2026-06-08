// Лёгкие inline-SVG графики для дашборда (рендерятся на сервере). Портировано из дизайна Nikas Cafe.
import styles from './ui.module.css';

const MON_SHORT = ['янв', 'фев', 'мар', 'апр', 'май', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
const rub = (n: number) => '₽ ' + Math.round(n).toLocaleString('ru-RU');
function dayLabel(iso: string): string {
  const d = Number(iso.slice(8, 10));
  const m = Number(iso.slice(5, 7));
  return `${d} ${MON_SHORT[m - 1] ?? ''}`;
}

/** Спарклайн: линия + мягкая заливка. `id` обязателен (уникальный для градиента). */
export function Sparkline({
  data,
  id,
  color = '#2e7d5b',
  width = 96,
  height = 28,
  fill = true,
}: {
  data: number[];
  id: string;
  color?: string;
  width?: number;
  height?: number;
  fill?: boolean;
}) {
  if (data.length < 2) return <svg width={width} height={height} />;
  const max = Math.max(...data);
  const min = Math.min(...data);
  const span = max - min || 1;
  const X = (i: number) => (i / (data.length - 1)) * width;
  const Y = (v: number) => height - ((v - min) / span) * (height - 4) - 2;
  let d = `M ${X(0)} ${Y(data[0])}`;
  for (let i = 1; i < data.length; i++) d += ` L ${X(i)} ${Y(data[i])}`;
  const area = `${d} L ${width} ${height} L 0 ${height} Z`;
  return (
    <svg width={width} height={height} style={{ display: 'block', overflow: 'visible' }}>
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.25" />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      {fill && <path d={area} fill={`url(#${id})`} />}
      <path d={d} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Пончик с круговыми сегментами (скруглённые концы, зазор) + подпись в центре. */
export function Donut({
  segments,
  size = 118,
  thickness = 20,
  center,
  sub,
  centerColor = '#1f2a25',
  subColor = '#8a958f',
}: {
  segments: { value: number; color: string }[];
  size?: number;
  thickness?: number;
  center?: string;
  sub?: string;
  centerColor?: string;
  subColor?: string;
}) {
  const total = segments.reduce((s, x) => s + x.value, 0) || 1;
  const rr = 50 - thickness / 2;
  const C = 2 * Math.PI * rr;
  const gap = 2;
  let offset = 0;
  return (
    <div style={{ position: 'relative', width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 100 100" style={{ width: size, height: size, transform: 'rotate(-90deg)' }}>
        {total === 0 ? (
          <circle cx="50" cy="50" r={rr} fill="none" stroke="#eceeec" strokeWidth={thickness} />
        ) : (
          segments.map((s, i) => {
            const len = (s.value / total) * C;
            const dash = Math.max(0, len - gap);
            const seg = (
              <circle
                key={i}
                cx="50"
                cy="50"
                r={rr}
                fill="none"
                stroke={s.color}
                strokeWidth={thickness}
                strokeDasharray={`${dash} ${C - dash}`}
                strokeDashoffset={-offset}
                strokeLinecap="round"
              />
            );
            offset += len;
            return seg;
          })
        )}
      </svg>
      {(center || sub) && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {center && (
            <div style={{ fontSize: size * 0.18, fontWeight: 800, color: centerColor, letterSpacing: '-0.02em' }}>
              {center}
            </div>
          )}
          {sub && <div style={{ fontSize: size * 0.085, color: subColor, fontWeight: 600, marginTop: 2 }}>{sub}</div>}
        </div>
      )}
    </div>
  );
}

/** Бары выручки по дням: подписи дней снизу + тултип (дата · выручка) на наведение. */
export function DayBars({ data, color = '#2563eb', height = 170 }: { data: { date: string; revenue: number }[]; color?: string; height?: number }) {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  return (
    <div>
      <div className={styles.bars2} style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className={styles.barCol}>
            <span className={styles.barTip}>{dayLabel(d.date)} · {rub(d.revenue)}</span>
            <span className={styles.bar} style={{ height: `${Math.max(2, (d.revenue / max) * 100)}%`, background: color }} />
          </div>
        ))}
      </div>
      <div className={styles.barAxis}>
        {data.map((d, i) => {
          const day = Number(d.date.slice(8, 10));
          return <span key={i} className={styles.barAxisCell}>{day % 5 === 0 ? day : ''}</span>;
        })}
      </div>
    </div>
  );
}

/** Стэк-бары по дням: кондитерка (низ) + пироги/прочее (верх), подписи дней + тултип. */
export function StackBars({
  data,
  height = 200,
  confColor = '#e0a458',
  otherColor = '#2563eb',
}: {
  data: { date: string; confectionery: number; other: number }[];
  height?: number;
  confColor?: string;
  otherColor?: string;
}) {
  const max = Math.max(1, ...data.map((d) => d.confectionery + d.other));
  return (
    <div>
      <div className={styles.stackBars} style={{ height }}>
        {data.map((d, i) => (
          <div key={i} className={styles.stackCol}>
            <span className={styles.barTip}>{dayLabel(d.date)} · конд. {rub(d.confectionery)} · пироги+проч. {rub(d.other)} · всего {rub(d.confectionery + d.other)}</span>
            <span className={styles.sseg} style={{ height: `${(d.confectionery / max) * 100}%`, background: confColor }} />
            <span className={styles.sseg} style={{ height: `${(d.other / max) * 100}%`, background: otherColor }} />
          </div>
        ))}
      </div>
      <div className={styles.barAxis}>
        {data.map((d, i) => {
          const day = Number(d.date.slice(8, 10));
          return <span key={i} className={styles.barAxisCell}>{day % 5 === 0 ? day : ''}</span>;
        })}
      </div>
    </div>
  );
}

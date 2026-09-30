// Средняя ЗП за смену — у владельца на /fot и у сотрудников на «Смены и ЗП».
// Только содержимое: карточку вокруг даёт страница (у владельца и сотрудника они разные).
import { monthLabel } from '@/lib/finance/month';
import { shiftsWord, type ShiftAverage, type ShiftAverages as ShiftAveragesData } from '@/lib/fot/shift-average';
import { rub } from './staff/_chrome';

const pill: React.CSSProperties = {
  display: 'inline-block',
  marginLeft: 6,
  padding: '2px 8px',
  borderRadius: 999,
  fontSize: 11,
  fontWeight: 800,
  color: 'var(--profit)',
  background: 'rgba(46,125,91,0.12)',
};

function Person({ p }: { p: ShiftAverage }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 10, padding: '8px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ minWidth: 0 }}>
        <div style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--ink)' }}>
          {p.name}
          {p.leader && <span style={pill}>лидер</span>}
        </div>
        <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>{`премия в среднем ${rub(p.avgBonus)} ₽ · ${p.shifts} ${shiftsWord(p.shifts)}`}</div>
      </div>
      <span style={{ flexShrink: 0, fontSize: 15, fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap', color: p.leader ? 'var(--profit)' : 'var(--ink)' }}>
        {`${rub(p.avgPay)} ₽`}
      </span>
    </div>
  );
}

export function ShiftAverages({ month, data }: { month: string; data: ShiftAveragesData }) {
  // Пекарей и кассиров не смешиваем: база и шкалы премий у них разные.
  const lists = [
    { title: 'Пекари', people: data.bakers },
    { title: 'Кассиры', people: data.cashiers },
  ].filter((l) => l.people.length > 0);
  return (
    <>
      <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Средняя ЗП за смену</h2>
      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>{`${monthLabel(month)} · считаются смены с внесённой выручкой`}</div>
      {lists.length === 0 ? (
        <div style={{ marginTop: 12, fontSize: 14, fontWeight: 600, color: 'var(--muted)' }}>Пока нет смен с внесённой выручкой.</div>
      ) : (
        // На компьютере списки встают рядом, на телефоне — друг под другом.
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: '12px 24px', marginTop: 12 }}>
          {lists.map((l) => (
            <div key={l.title}>
              <h3 style={{ fontSize: 13, fontWeight: 800, color: 'var(--muted)', marginBottom: 4 }}>{l.title}</h3>
              {l.people.map((p) => (
                <Person key={p.id} p={p} />
              ))}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

import { describe, expect, it } from 'vitest';
import type { DishSaleDay } from '../iiko/types';
import { analyzeAssortment, selectionSummary, type AssortmentItem } from './analyze';

const FROM = '2026-08-19';
const TILL = '2026-11-17'; // 91 день

type Sale = Partial<DishSaleDay> & { date: string; dishId: string };
const sale = (s: Sale): DishSaleDay => ({ name: s.dishId, dishGroup: null, qty: 1, revenue: 100, cost: 0, checks: 1, soloChecks: 0, ...s });

/** Позиция, которая продаётся с января и до вчера (первая/последняя продажа — в spans). */
const spansOf = (rows: DishSaleDay[], extra: Record<string, { first: string; last: string }> = {}) => {
  const m = new Map<string, { first: string; last: string }>();
  for (const r of rows) {
    const s = m.get(r.dishId) ?? { first: '2026-01-03', last: TILL };
    m.set(r.dishId, s);
  }
  for (const [k, v] of Object.entries(extra)) m.set(k, v);
  return m;
};

const item = (items: AssortmentItem[], id: string) => {
  const it = items.find((i) => i.dishId === id);
  if (!it) throw new Error(`нет позиции ${id}`);
  return it;
};

describe('analyzeAssortment — статусы', () => {
  const rows = [
    sale({ date: '2026-11-10', dishId: 'korean', name: '// Курочка по корейски 159', revenue: 1423, dishGroup: 'Сытная мелкоштучка' }),
    sale({ date: '2026-10-01', dishId: 'lemonade', name: 'Лимонад 95', revenue: 9000, dishGroup: 'ЛПЗ' }),
    sale({ date: '2026-11-15', dishId: 'julien', name: 'Пирог Жульен (Заказной) 729', revenue: 5103, dishGroup: 'Заказные пироги' }),
    sale({ date: '2026-11-15', dishId: 'bag', name: 'Пакет Майка 8р', revenue: 3382 }),
    sale({ date: '2026-11-16', dishId: 'pizza', name: '// Пицца Классическая 126', revenue: 100000 }),
  ];
  const v = analyzeAssortment({
    rows,
    spans: spansOf(rows, { korean: { first: '2026-10-04', last: TILL }, lemonade: { first: '2026-03-06', last: '2026-11-02' } }),
    from: FROM,
    till: TILL,
  });

  it('новинка (в продаже меньше 60 дней) — не кандидат', () => {
    expect(item(v.items, 'korean')).toMatchObject({ status: 'new', abc: null, name: 'Курочка по корейски 159', category: 'savory' });
  });

  it('нет продаж 14 дней — «не продаётся» (сезонное или снято)', () => {
    expect(item(v.items, 'lemonade')).toMatchObject({ status: 'stopped', abc: null, lastSale: '2026-11-02', category: 'drinks' });
  });

  it('заказной пирог — отдельный статус, не кандидат', () => {
    expect(item(v.items, 'julien')).toMatchObject({ status: 'order', abc: null });
  });

  it('служебное не позиция: нет в списке и в выручке', () => {
    expect(v.items.find((i) => i.dishId === 'bag')).toBeUndefined();
    expect(v.totalRevenue).toBe(1423 + 9000 + 5103 + 100000);
  });

  it('счётчики: в продаже — с продажами за последние 14 дней', () => {
    expect(v.counts).toMatchObject({ onSale: 3, new: 1, stopped: 1, A: 1, B: 0, C: 0 });
  });
});

describe('analyzeAssortment — ABC среди оцениваемых', () => {
  const revenues = [50, 20, 10, 8, 5, 3, 2, 1, 0.5, 0.5];
  const rows = revenues.map((r, i) => sale({ date: '2026-11-10', dishId: `d${i}`, revenue: r * 1000 }));
  const v = analyzeAssortment({ rows, spans: spansOf(rows), from: FROM, till: TILL });

  it('A — пока накоплено до позиции < 80 %, B — < 95 %, дальше C', () => {
    expect(v.items.map((i) => i.abc).join('')).toBe('AAABBBCCCC');
    expect(v.counts).toMatchObject({ A: 3, B: 3, C: 4 });
    expect(v.abcShare).toEqual({ A: 80, B: 16, C: 4 });
  });

  it('по убыванию выручки, доля — от всей выручки периода', () => {
    expect(v.items[0]).toMatchObject({ dishId: 'd0', share: 50 });
  });
});

describe('analyzeAssortment — метрики позиции', () => {
  it('редко пекут, но разбирают: дней в продаже и штук в день продажи', () => {
    const rows = Array.from({ length: 9 }, (_, i) => sale({ date: `2026-10-0${i + 1}`, dishId: 'trifle', qty: 2.6, revenue: 780 }));
    const other = [sale({ date: '2026-10-15', dishId: 'pizza' }), sale({ date: '2026-11-16', dishId: 'pizza' })];
    const v = analyzeAssortment({ rows: [...rows, ...other], spans: spansOf([...rows, ...other]), from: FROM, till: TILL });
    expect(item(v.items, 'trifle')).toMatchObject({ daysSold: 9, qtyPerSoldDay: 2.6 });
    expect(v.openDays).toBe(11);
  });

  it('в месяц = выручка / дней периода × 30', () => {
    const rows = [sale({ date: '2026-11-10', dishId: 'x', revenue: 9100 })];
    expect(analyzeAssortment({ rows, spans: spansOf(rows), from: FROM, till: TILL }).items[0].perMonth).toBe(3000);
  });

  it('тренд: последние 30 дней к предыдущим 30; без продаж в одном из окон — нет тренда', () => {
    const rows = [
      sale({ date: '2026-11-01', dishId: 'up', revenue: 3000 }),
      sale({ date: '2026-10-01', dishId: 'up', revenue: 2000 }),
      sale({ date: '2026-11-01', dishId: 'fresh', revenue: 3000 }),
    ];
    const v = analyzeAssortment({ rows, spans: spansOf(rows), from: '2026-10-19', till: TILL });
    expect(item(v.items, 'up').trend).toBe(50);
    expect(item(v.items, 'up').revenue).toBe(3000); // 01.10 — до периода, только для тренда
    expect(item(v.items, 'fresh').trend).toBeNull();
  });

  it('по неделям: от старой к новой, последняя неделя кончается вчера', () => {
    const rows = [sale({ date: '2026-11-17', dishId: 'x', revenue: 10 }), sale({ date: '2026-11-10', dishId: 'x', revenue: 7 })];
    const w = analyzeAssortment({ rows, spans: spansOf(rows), from: '2026-10-19', till: TILL }).items[0].weekly;
    expect(w).toHaveLength(5);
    expect(w.slice(-2)).toEqual([7, 10]);
  });

  it('«берут отдельно» — только при ≥ 20 чеках', () => {
    const few = [sale({ date: '2026-11-10', dishId: 'x', checks: 19, soloChecks: 5 })];
    const enough = [sale({ date: '2026-11-10', dishId: 'x', checks: 20, soloChecks: 5 })];
    expect(analyzeAssortment({ rows: few, spans: spansOf(few), from: FROM, till: TILL }).items[0].soloShare).toBeNull();
    expect(analyzeAssortment({ rows: enough, spans: spansOf(enough), from: FROM, till: TILL }).items[0].soloShare).toBe(25);
  });

  it('наценка — только если себестоимость есть во всех днях продаж', () => {
    const full = [sale({ date: '2026-11-10', dishId: 'x', revenue: 252, cost: 60 })];
    const partial = [...full, sale({ date: '2026-11-11', dishId: 'x', revenue: 126, cost: 0 })];
    expect(analyzeAssortment({ rows: full, spans: spansOf(full), from: FROM, till: TILL }).items[0].markup).toBe(320);
    expect(analyzeAssortment({ rows: partial, spans: spansOf(partial), from: FROM, till: TILL }).items[0].markup).toBeNull();
  });

  it('пусто — без NaN', () => {
    const v = analyzeAssortment({ rows: [], spans: new Map(), from: FROM, till: TILL });
    expect(v).toMatchObject({ items: [], totalRevenue: 0, openDays: 0, abcShare: { A: 0, B: 0, C: 0 } });
  });
});

describe('selectionSummary — «уберу эти — что потеряю»', () => {
  it('сумма в месяц, доля выручки и как часто их брали отдельно', () => {
    const rows = [
      sale({ date: '2026-11-10', dishId: 'a', revenue: 9100, checks: 30, soloChecks: 3 }),
      sale({ date: '2026-11-10', dishId: 'b', revenue: 4550, checks: 10, soloChecks: 1 }),
      sale({ date: '2026-11-10', dishId: 'c', revenue: 86350 }),
    ];
    const v = analyzeAssortment({ rows, spans: spansOf(rows), from: FROM, till: TILL });
    expect(selectionSummary(v.items, new Set(['a', 'b']), v.totalRevenue)).toEqual({ count: 2, perMonth: 4500, share: 13.65, soloShare: 10 });
    expect(selectionSummary(v.items, new Set(), v.totalRevenue)).toEqual({ count: 0, perMonth: 0, share: 0, soloShare: null });
  });
});

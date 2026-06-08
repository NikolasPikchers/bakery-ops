# Bakery Ops — Phase 4b: Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `/` a Nikas Cafe-branded dashboard showing net profit (revenue iiko − expenses Т-Бизнес) as the lead KPI, plus revenue-by-day, expense breakdown, and operational blocks (current stock, aging for Корица, top write-offs, sheets-to-review), filterable by point and month.

**Architecture:** Pure aggregators (TDD) turn raw finance + movement rows into a view-model; a thin dashboard repo fetches per (point, month) and assembles the view; a server component renders KPI cards, CSS/SVG charts, and tables (no chart library — CSS bars + conic-gradient donut, as in the approved mockup). Filters are plain links that set query params (no client JS). The sheet list moves from `/` to `/sheets`. Brand = light "mint" style A via CSS tokens + a logo component with text fallback.

**Tech Stack:** Next.js 16 (App Router, RSC, `searchParams`/`params` are Promises), Prisma 7 (`getPrisma()`), Neon, Vitest. Money ₽ (`Number(Decimal)`), `Intl` for formatting.

**Spec:** `docs/superpowers/specs/2026-06-07-bakery-ops-phase4-dashboard-finance-design.md` (§6 dashboard, §8 computations, §3 brand). Builds on Phase 4a (Revenue/Expense models, points Плюшкино/Корица, `/finance`).

---

## Decisions locked

- **Daily chart = revenue only** (variant A). Net profit + margin are monthly KPIs; monthly fixed costs (rent/ФОТ/taxes) are NOT allocated to days.
- **Filters via query params** (`?point=all|point-1|point-2&month=YYYY-MM`), rendered as links — dashboard stays a server component. Default: `point=all`, `month`=current month (server `new Date()`).
- **No chart lib.** Bars = fl. divs with `%` heights; donut = `conic-gradient`.
- **Charts/operational from existing data:** finance from Revenue/Expense (4a); stock/aging/write-offs from `movements` (Phase 1), reusing `computeAging`.
- **`/` → dashboard; sheet list → `/sheets`.** Nav: Дашборд · Листы · Финансы · Загрузить.
- **Logo:** `<img src="/nikas-cafe-logo.png">` with text fallback (file may be absent) via a tiny client component.
- Money read via `Number(Decimal)`; formatted with `toLocaleString('ru-RU')`.

---

## File Structure

**New — lib (unit-tested):**
- `src/lib/finance/month.ts` — pure month helpers (`currentMonth`, `monthRange`, `prevMonth`, `nextMonth`, `monthDays`).
- `src/lib/finance/dashboard-aggregate.ts` — `aggregateFinance(input)` → KPIs, deltas, byDay, byCategory.
- `src/lib/db/ops-aggregate.ts` — pure `currentOstatki`, `topSpisaniya`, `agingDesserts` over movement rows.

**New — db / app:**
- `src/lib/db/dashboard-repo.ts` — `loadDashboard(prisma, {point, month})` → `DashboardView`.
- `src/app/Logo.tsx` — branded logo with text fallback (client).
- `src/app/sheets/page.tsx` — the moved sheet list (former `/`).
- `src/app/page.tsx` — REWRITTEN as the dashboard.

**Modified:**
- `src/app/globals.css` — brand CSS tokens + light bg.
- `src/app/ui.module.css` — dashboard classes (kpi/charts/donut/filters/logo).
- `src/app/layout.tsx` — nav (Дашборд/Листы/Финансы/Загрузить) + Logo.

---

## Task 1: Brand tokens + Logo + nav

**Files:**
- Modify: `src/app/globals.css`
- Modify: `src/app/ui.module.css`
- Create: `src/app/Logo.tsx`
- Modify: `src/app/layout.tsx`

- [ ] **Step 1: Add brand tokens to `src/app/globals.css`** — replace the `:root { --background...; --foreground...; }` block (lines 1-4) with:

```css
:root {
  --background: #ffffff;
  --foreground: #171717;
  --bg: #f4f7f5;
  --card: #ffffff;
  --line: #eceeec;
  --muted: #7d8c84;
  --brand: #8fbc9b;
  --profit: #2e7d5b;
  --revenue: #2563eb;
  --expense: #c0392b;
  --ink: #1d2b22;
}
```

And change the `body { ... }` rule's `background: var(--background);` line to `background: var(--bg);` and `color: var(--foreground);` to `color: var(--ink);` (so the app is consistently light-mint regardless of OS dark mode).

- [ ] **Step 2: Append dashboard classes to `src/app/ui.module.css`** (add at end of file):

```css
/* dashboard */
.logoImg { height: 30px; width: auto; display: block; }
.logoText { display: inline-flex; align-items: center; justify-content: center; width: 34px; height: 34px; border-radius: 9px; background: var(--brand); color: #fff; font-style: italic; font-weight: 700; font-size: 10px; line-height: .95; text-align: center; }
.filters { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin: 12px 0 20px; }
.pill { font-size: 13px; padding: 5px 12px; border-radius: 999px; background: #eef2f0; color: #3a4a42; text-decoration: none; }
.pillOn { background: var(--brand); color: #fff; }
.month { font-size: 13px; padding: 5px 10px; border: 1px solid #d7e0db; border-radius: 8px; color: #3a4a42; text-decoration: none; }
.kpis { display: grid; grid-template-columns: 1.3fr 1fr 1fr 1fr; gap: 12px; }
.kpi { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.kpiLead { background: var(--profit); border: 0; color: #fff; }
.kpiLab { font-size: 11px; text-transform: uppercase; letter-spacing: .4px; color: var(--muted); }
.kpiLead .kpiLab { color: #cfeBdc; }
.kpiVal { font-size: 24px; font-weight: 800; margin-top: 4px; }
.kpiVal.sm { font-size: 19px; }
.delta { font-size: 11px; font-weight: 700; margin-top: 3px; color: var(--muted); }
.up { color: #2e7d5b; } .down { color: #c0392b; }
.kpiLead .delta { color: #bdf0d3; }
.grid2 { display: grid; grid-template-columns: 1.7fr 1fr; gap: 12px; margin-top: 12px; }
.panel { background: var(--card); border: 1px solid var(--line); border-radius: 12px; padding: 14px 16px; }
.panelTtl { font-size: 13px; font-weight: 700; margin-bottom: 10px; }
.bars { display: flex; align-items: flex-end; gap: 4px; height: 140px; }
.bars > div { flex: 1; min-width: 3px; border-radius: 4px 4px 0 0; background: #9fccb2; }
.donut { width: 130px; height: 130px; border-radius: 50%; margin: 4px auto 10px; }
.legend { font-size: 12px; display: flex; flex-direction: column; gap: 4px; }
.legend i { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 7px; }
.empty { color: var(--muted); font-size: 14px; }
.stale { background: #fff6e6; }
.age { color: #b9772a; font-weight: 700; }
.num { text-align: right; font-variant-numeric: tabular-nums; }
```

- [ ] **Step 3: Create `src/app/Logo.tsx`:**

```tsx
'use client';

import { useState } from 'react';
import styles from './ui.module.css';

export function Logo() {
  const [broken, setBroken] = useState(false);
  if (broken) return <span className={styles.logoText}>nikas<br />cafe</span>;
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.logoImg} src="/nikas-cafe-logo.png" alt="Nikas Cafe" onError={() => setBroken(true)} />
  );
}
```

- [ ] **Step 4: Update nav in `src/app/layout.tsx`** — replace the three nav links block:
```tsx
            <Link href="/">Остатки</Link>
            <Link href="/finance">Финансы</Link>
            <Link href="/upload">Загрузить лист</Link>
```
with (add Logo import at top: `import { Logo } from './Logo';`):
```tsx
            <Link href="/" aria-label="Nikas Cafe"><Logo /></Link>
            <Link href="/">Дашборд</Link>
            <Link href="/sheets">Листы</Link>
            <Link href="/finance">Финансы</Link>
            <Link href="/upload">Загрузить</Link>
```

- [ ] **Step 5: Verify**

Run: `npx tsc --noEmit && npx eslint src/app/Logo.tsx src/app/layout.tsx && npm run build 2>&1 | grep -E 'Compiled|error|Error' | head`
Expected: clean; build compiles. (`/sheets` will 404 until Task 2 — that's fine, not built yet.)

- [ ] **Step 6: Commit**

```bash
git add src/app/globals.css src/app/ui.module.css src/app/Logo.tsx src/app/layout.tsx
git commit -m "feat(ui): бренд-токены Nikas Cafe + логотип + навигация дашборда"
```

---

## Task 2: Move sheet list to /sheets

**Files:**
- Create: `src/app/sheets/page.tsx`

The current `/` (sheet list) content moves to `/sheets`. `/` will be replaced by the dashboard in Task 7. Until then `/` still shows the old list (harmless, local-only).

- [ ] **Step 1: Create `src/app/sheets/page.tsx`** with the CURRENT content of `src/app/page.tsx` (read it first to copy verbatim), changing only the `<h1>` to keep "Листы". The current `src/app/page.tsx` is:

```tsx
import Link from 'next/link';
import { getPrisma } from '@/lib/db/client';
import styles from '../ui.module.css';

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
```

Write that EXACTLY to `src/app/sheets/page.tsx`, but rename the function `Home` → `SheetsList` and change the import path `'../ui.module.css'` → `'../ui.module.css'` (same depth: `src/app/sheets/page.tsx` → `../ui.module.css` resolves to `src/app/ui.module.css`. Correct). Keep everything else identical.

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npm run build 2>&1 | grep -E '/sheets|error' | head`
Expected: `/sheets` appears as a route; build clean. (`/sheets/[id]` already exists — `/sheets` is the new index.)

- [ ] **Step 3: Commit**

```bash
git add src/app/sheets/page.tsx
git commit -m "feat(ui): список листов переехал на /sheets"
```

---

## Task 3: Month helpers (pure)

**Files:**
- Create: `src/lib/finance/month.ts`
- Test: `src/lib/finance/month.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/finance/month.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { currentMonth, monthRange, prevMonth, nextMonth, monthDays, monthLabel } from './month';

describe('month helpers', () => {
  it('currentMonth formats YYYY-MM from a Date', () => {
    expect(currentMonth(new Date('2026-06-08T10:00:00Z'))).toBe('2026-06');
  });
  it('monthRange returns first day and first day of next month (ISO)', () => {
    expect(monthRange('2026-06')).toEqual({ start: '2026-06-01', end: '2026-07-01' });
    expect(monthRange('2026-12')).toEqual({ start: '2026-12-01', end: '2027-01-01' });
  });
  it('prevMonth / nextMonth wrap years', () => {
    expect(prevMonth('2026-01')).toBe('2025-12');
    expect(nextMonth('2026-12')).toBe('2027-01');
    expect(prevMonth('2026-06')).toBe('2026-05');
  });
  it('monthDays lists every ISO day of the month', () => {
    const d = monthDays('2026-02'); // 2026 not leap → 28 days
    expect(d[0]).toBe('2026-02-01');
    expect(d.length).toBe(28);
    expect(d[27]).toBe('2026-02-28');
  });
  it('monthLabel is a ru month + year', () => {
    expect(monthLabel('2026-06')).toBe('Июнь 2026');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/finance/month.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write implementation** — `src/lib/finance/month.ts`:

```ts
const RU_MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];

const pad = (n: number) => String(n).padStart(2, '0');

export function currentMonth(d: Date): string {
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`;
}

function parse(month: string): { y: number; m: number } {
  const [y, m] = month.split('-').map(Number);
  return { y, m };
}

export function monthRange(month: string): { start: string; end: string } {
  const { y, m } = parse(month);
  const start = `${y}-${pad(m)}-01`;
  const ny = m === 12 ? y + 1 : y;
  const nm = m === 12 ? 1 : m + 1;
  return { start, end: `${ny}-${pad(nm)}-01` };
}

export function prevMonth(month: string): string {
  const { y, m } = parse(month);
  return m === 1 ? `${y - 1}-12` : `${y}-${pad(m - 1)}`;
}

export function nextMonth(month: string): string {
  const { y, m } = parse(month);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}

export function monthDays(month: string): string[] {
  const { y, m } = parse(month);
  const count = new Date(Date.UTC(y, m, 0)).getUTCDate(); // day 0 of next month = last day of this
  return Array.from({ length: count }, (_, i) => `${y}-${pad(m)}-${pad(i + 1)}`);
}

export function monthLabel(month: string): string {
  const { y, m } = parse(month);
  return `${RU_MONTHS[m - 1]} ${y}`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/finance/month.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/month.ts src/lib/finance/month.test.ts
git commit -m "feat(finance): помощники по месяцам (диапазон/дни/метка/навигация)"
```

---

## Task 4: Finance aggregator (pure)

**Files:**
- Create: `src/lib/finance/dashboard-aggregate.ts`
- Test: `src/lib/finance/dashboard-aggregate.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/finance/dashboard-aggregate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { aggregateFinance } from './dashboard-aggregate';

describe('aggregateFinance', () => {
  const input = {
    monthDays: ['2026-06-01', '2026-06-02', '2026-06-03'],
    revenues: [
      { date: '2026-06-01', amount: 10000 },
      { date: '2026-06-01', amount: 5000 },
      { date: '2026-06-03', amount: 20000 },
    ],
    expenses: [
      { date: '2026-06-01', amount: 4000, category: 'produkty' },
      { date: '2026-06-02', amount: 30000, category: 'arenda' },
    ],
    prevRevenue: 25000,
    prevExpense: 20000,
  };

  it('computes revenue, expense, profit, margin', () => {
    const r = aggregateFinance(input);
    expect(r.revenue).toBe(35000);
    expect(r.expense).toBe(34000);
    expect(r.profit).toBe(1000);
    expect(r.margin).toBeCloseTo((1000 / 35000) * 100, 4);
  });

  it('computes deltas vs previous period (% for money)', () => {
    const r = aggregateFinance(input);
    expect(r.revenueDelta).toBeCloseTo(((35000 - 25000) / 25000) * 100, 4);
    expect(r.profitDelta).toBeCloseTo(((1000 - 5000) / 5000) * 100, 4); // prev profit = 25000-20000=5000
  });

  it('byDay sums revenue per day across all month days (zero-filled)', () => {
    const r = aggregateFinance(input);
    expect(r.byDay).toEqual([
      { date: '2026-06-01', revenue: 15000 },
      { date: '2026-06-02', revenue: 0 },
      { date: '2026-06-03', revenue: 20000 },
    ]);
  });

  it('byCategory sums + percentages, sorted desc, drops zero', () => {
    const r = aggregateFinance(input);
    expect(r.byCategory).toEqual([
      { category: 'arenda', amount: 30000, pct: (30000 / 34000) * 100 },
      { category: 'produkty', amount: 4000, pct: (4000 / 34000) * 100 },
    ]);
  });

  it('margin null when revenue is 0; deltas null when prev is 0', () => {
    const r = aggregateFinance({ monthDays: ['2026-06-01'], revenues: [], expenses: [], prevRevenue: 0, prevExpense: 0 });
    expect(r.revenue).toBe(0);
    expect(r.margin).toBeNull();
    expect(r.revenueDelta).toBeNull();
    expect(r.profitDelta).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/finance/dashboard-aggregate.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write implementation** — `src/lib/finance/dashboard-aggregate.ts`:

```ts
export type FinanceAggInput = {
  monthDays: string[];
  revenues: { date: string; amount: number }[];
  expenses: { date: string; amount: number; category: string }[];
  prevRevenue: number;
  prevExpense: number;
};

export type FinanceSummary = {
  revenue: number;
  expense: number;
  profit: number;
  margin: number | null;
  revenueDelta: number | null;
  expenseDelta: number | null;
  profitDelta: number | null;
  marginDelta: number | null;
  byDay: { date: string; revenue: number }[];
  byCategory: { category: string; amount: number; pct: number }[];
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);

function pctDelta(curr: number, prev: number): number | null {
  if (prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export function aggregateFinance(input: FinanceAggInput): FinanceSummary {
  const revenue = sum(input.revenues.map((r) => r.amount));
  const expense = sum(input.expenses.map((e) => e.amount));
  const profit = revenue - expense;
  const margin = revenue === 0 ? null : (profit / revenue) * 100;

  const prevProfit = input.prevRevenue - input.prevExpense;
  const prevMargin = input.prevRevenue === 0 ? null : (prevProfit / input.prevRevenue) * 100;

  const byDay = input.monthDays.map((date) => ({
    date,
    revenue: sum(input.revenues.filter((r) => r.date === date).map((r) => r.amount)),
  }));

  const catMap = new Map<string, number>();
  for (const e of input.expenses) catMap.set(e.category, (catMap.get(e.category) ?? 0) + e.amount);
  const byCategory = [...catMap.entries()]
    .filter(([, amount]) => amount > 0)
    .map(([category, amount]) => ({ category, amount, pct: expense === 0 ? 0 : (amount / expense) * 100 }))
    .sort((a, b) => b.amount - a.amount);

  return {
    revenue,
    expense,
    profit,
    margin,
    revenueDelta: pctDelta(revenue, input.prevRevenue),
    expenseDelta: pctDelta(expense, input.prevExpense),
    profitDelta: pctDelta(profit, prevProfit),
    marginDelta: margin == null || prevMargin == null ? null : margin - prevMargin,
    byDay,
    byCategory,
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/finance/dashboard-aggregate.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/dashboard-aggregate.ts src/lib/finance/dashboard-aggregate.test.ts
git commit -m "feat(finance): агрегатор дашборда (KPI/дельты/по дням/по категориям)"
```

---

## Task 5: Operational aggregator (pure)

**Files:**
- Create: `src/lib/db/ops-aggregate.ts`
- Test: `src/lib/db/ops-aggregate.test.ts`

Reuses `computeAging` from `@/lib/domain/aging` (signature: `computeAging(history: {date,prihod,ostatok}[], asOf, shelfLifeDays=5) => { currentOstatok, lastPrihodDate, ageDays, stale }`).

- [ ] **Step 1: Write the failing test** — `src/lib/db/ops-aggregate.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { currentOstatki, topSpisaniya, agingDesserts, type MovementRow } from './ops-aggregate';

const rows: MovementRow[] = [
  { pointId: 'point-1', pointName: 'Плюшкино', productId: 'p1', productName: 'Самса', sheetType: 'pies', date: '2026-06-05', prihod: 24, ostatok: 9, spisanie: 0, shelfLifeDays: null },
  { pointId: 'point-1', pointName: 'Плюшкино', productId: 'p1', productName: 'Самса', sheetType: 'pies', date: '2026-06-06', prihod: 8, ostatok: 2, spisanie: 3, shelfLifeDays: null },
  { pointId: 'point-2', pointName: 'Корица', productId: 'd1', productName: 'Бенто Орео', sheetType: 'desserts', date: '2026-06-01', prihod: 5, ostatok: 5, spisanie: 0, shelfLifeDays: 5 },
  { pointId: 'point-2', pointName: 'Корица', productId: 'd1', productName: 'Бенто Орео', sheetType: 'desserts', date: '2026-06-04', prihod: 0, ostatok: 3, spisanie: 0, shelfLifeDays: 5 },
];

describe('currentOstatki', () => {
  it('takes the latest non-null ostatok per product/point, sorted by name', () => {
    const r = currentOstatki(rows);
    expect(r).toEqual([
      { productName: 'Бенто Орео', pointName: 'Корица', ostatok: 3 },
      { productName: 'Самса', pointName: 'Плюшкино', ostatok: 2 },
    ]);
  });
});

describe('topSpisaniya', () => {
  it('sums spisanie within the month range per product, desc, drops zero', () => {
    const r = topSpisaniya(rows, '2026-06-01', '2026-07-01');
    expect(r).toEqual([{ productName: 'Самса', pointName: 'Плюшкино', total: 3 }]);
  });
});

describe('agingDesserts', () => {
  it('flags Корица desserts with ostatok>0 and age beyond shelf life', () => {
    const r = agingDesserts(rows, '2026-06-12');
    // Бенто Орео: last prihod 2026-06-01, ostatok 3 (>0), age to 2026-06-12 = 11 days > 5 → stale
    expect(r).toEqual([{ productName: 'Бенто Орео', ageDays: 11, ostatok: 3, stale: true }]);
  });
  it('ignores pies and zero-stock items', () => {
    const r = agingDesserts(rows.filter((x) => x.sheetType === 'pies'), '2026-06-12');
    expect(r).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/db/ops-aggregate.test.ts`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Write implementation** — `src/lib/db/ops-aggregate.ts`:

```ts
import { computeAging } from '@/lib/domain/aging';

export type MovementRow = {
  pointId: string;
  pointName: string;
  productId: string;
  productName: string;
  sheetType: string;
  date: string; // ISO yyyy-mm-dd
  prihod: number | null;
  ostatok: number | null;
  spisanie: number | null;
  shelfLifeDays: number | null;
};

export type OstatokRow = { productName: string; pointName: string; ostatok: number };
export type SpisanieRow = { productName: string; pointName: string; total: number };
export type AgingRow = { productName: string; ageDays: number | null; ostatok: number; stale: boolean };

function groupByProductPoint(rows: MovementRow[]): Map<string, MovementRow[]> {
  const m = new Map<string, MovementRow[]>();
  for (const r of rows) {
    const k = `${r.pointId}|${r.productId}`;
    const list = m.get(k) ?? [];
    list.push(r);
    m.set(k, list);
  }
  return m;
}

/** Текущий остаток = остаток последней даты с заполненным остатком, по каждому товару/точке. */
export function currentOstatki(rows: MovementRow[]): OstatokRow[] {
  const out: OstatokRow[] = [];
  for (const list of groupByProductPoint(rows).values()) {
    const desc = [...list].sort((a, b) => b.date.localeCompare(a.date));
    const latest = desc.find((r) => r.ostatok != null);
    if (latest && latest.ostatok != null) {
      out.push({ productName: latest.productName, pointName: latest.pointName, ostatok: latest.ostatok });
    }
  }
  return out.sort((a, b) => a.productName.localeCompare(b.productName));
}

/** Сумма списаний за период [start, end) по товару/точке, по убыванию, без нулей. */
export function topSpisaniya(rows: MovementRow[], start: string, end: string): SpisanieRow[] {
  const m = new Map<string, SpisanieRow>();
  for (const r of rows) {
    if (r.date < start || r.date >= end) continue;
    const k = `${r.pointId}|${r.productId}`;
    const cur = m.get(k) ?? { productName: r.productName, pointName: r.pointName, total: 0 };
    cur.total += r.spisanie ?? 0;
    m.set(k, cur);
  }
  return [...m.values()].filter((x) => x.total > 0).sort((a, b) => b.total - a.total);
}

/** Aging для десертов Корицы (point-2, sheetType desserts): возраст остатка vs shelfLifeDays. */
export function agingDesserts(rows: MovementRow[], asOf: string): AgingRow[] {
  const desserts = rows.filter((r) => r.pointId === 'point-2' && r.sheetType === 'desserts');
  const out: AgingRow[] = [];
  for (const list of groupByProductPoint(desserts).values()) {
    const shelf = list.find((r) => r.shelfLifeDays != null)?.shelfLifeDays ?? 5;
    const history = list.map((r) => ({ date: r.date, prihod: r.prihod, ostatok: r.ostatok }));
    const a = computeAging(history, asOf, shelf);
    if (a.currentOstatok != null && a.currentOstatok > 0) {
      out.push({ productName: list[0].productName, ageDays: a.ageDays, ostatok: a.currentOstatok, stale: a.stale });
    }
  }
  return out.sort((a, b) => Number(b.stale) - Number(a.stale) || (b.ageDays ?? 0) - (a.ageDays ?? 0));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/db/ops-aggregate.test.ts`
Expected: PASS (4 tests). (Aging: 2026-06-01 → 2026-06-12 = 11 days; >5 → stale.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/ops-aggregate.ts src/lib/db/ops-aggregate.test.ts
git commit -m "feat(db): операционные агрегаторы (остатки/списания/aging)"
```

---

## Task 6: Dashboard repo

**Files:**
- Create: `src/lib/db/dashboard-repo.ts`

Thin: fetch per (point, month), assemble `DashboardView` using the aggregators. Verified by tsc + Task 8 preview e2e.

- [ ] **Step 1: Write the implementation** — `src/lib/db/dashboard-repo.ts`:

```ts
import type { PrismaClient } from '@prisma/client';
import { monthRange, monthDays, prevMonth } from '@/lib/finance/month';
import { aggregateFinance, type FinanceSummary } from '@/lib/finance/dashboard-aggregate';
import { currentOstatki, topSpisaniya, agingDesserts, type MovementRow } from './ops-aggregate';

export type DashboardPoint = 'all' | 'point-1' | 'point-2';

export type DashboardView = {
  point: DashboardPoint;
  month: string;
  finance: FinanceSummary;
  ostatki: ReturnType<typeof currentOstatki>;
  spisaniya: ReturnType<typeof topSpisaniya>;
  aging: ReturnType<typeof agingDesserts>;
  sheetsQueue: { id: string; date: string; pointName: string; sheetType: string }[];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

export async function loadDashboard(
  prisma: PrismaClient,
  opts: { point: DashboardPoint; month: string; asOf: string },
): Promise<DashboardView> {
  const { point, month, asOf } = opts;
  const pointWhere = point === 'all' ? {} : { pointId: point };
  const { start, end } = monthRange(month);
  const prev = monthRange(prevMonth(month));
  const startD = new Date(`${start}T00:00:00.000Z`);
  const endD = new Date(`${end}T00:00:00.000Z`);
  const prevStartD = new Date(`${prev.start}T00:00:00.000Z`);
  const prevEndD = new Date(`${prev.end}T00:00:00.000Z`);

  const [revCur, expCur, revPrev, expPrev, movements, sheets] = await Promise.all([
    prisma.revenue.findMany({ where: { ...pointWhere, date: { gte: startD, lt: endD } }, select: { date: true, amount: true } }),
    prisma.expense.findMany({ where: { ...pointWhere, date: { gte: startD, lt: endD } }, select: { date: true, amount: true, category: true } }),
    prisma.revenue.findMany({ where: { ...pointWhere, date: { gte: prevStartD, lt: prevEndD } }, select: { amount: true } }),
    prisma.expense.findMany({ where: { ...pointWhere, date: { gte: prevStartD, lt: prevEndD } }, select: { amount: true } }),
    prisma.movement.findMany({
      where: { ...pointWhere },
      include: { point: { select: { name: true } }, product: { select: { name: true, sheetType: true, shelfLifeDays: true } } },
    }),
    prisma.sheet.findMany({ where: { ...pointWhere, status: 'needs_review' }, orderBy: { createdAt: 'desc' }, take: 20, include: { point: { select: { name: true } } } }),
  ]);

  const finance = aggregateFinance({
    monthDays: monthDays(month),
    revenues: revCur.map((r) => ({ date: iso(r.date), amount: Number(r.amount) })),
    expenses: expCur.map((e) => ({ date: iso(e.date), amount: Number(e.amount), category: e.category })),
    prevRevenue: revPrev.reduce((a, r) => a + Number(r.amount), 0),
    prevExpense: expPrev.reduce((a, e) => a + Number(e.amount), 0),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rows: MovementRow[] = movements.map((m: any) => ({
    pointId: m.pointId,
    pointName: m.point.name,
    productId: m.productId,
    productName: m.product.name,
    sheetType: m.product.sheetType,
    date: iso(m.date),
    prihod: m.prihod,
    ostatok: m.ostatok,
    spisanie: m.spisanie,
    shelfLifeDays: m.product.shelfLifeDays,
  }));

  return {
    point,
    month,
    finance,
    ostatki: currentOstatki(rows),
    spisaniya: topSpisaniya(rows, start, end),
    aging: agingDesserts(rows, asOf),
    sheetsQueue: sheets.map((s) => ({ id: s.id, date: iso(s.createdAt), pointName: s.point.name, sheetType: s.sheetType })),
  };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit && npx eslint src/lib/db/dashboard-repo.ts`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/dashboard-repo.ts
git commit -m "feat(db): сборка модели дашборда по точке и месяцу"
```

---

## Task 7: Dashboard page

**Files:**
- Modify (rewrite): `src/app/page.tsx`

- [ ] **Step 1: Rewrite `src/app/page.tsx`** as the dashboard:

```tsx
import Link from 'next/link';
import { getPrisma } from '@/lib/db/client';
import { loadDashboard, type DashboardPoint } from '@/lib/db/dashboard-repo';
import { currentMonth, monthLabel, prevMonth, nextMonth } from '@/lib/finance/month';
import { categoryLabel } from '@/lib/finance/categories';
import { POINTS } from '@/lib/domain/points';
import styles from './ui.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ruble = (n: number) => `₽ ${Math.round(n).toLocaleString('ru-RU')}`;
const CAT_COLORS = ['#2E7D5B', '#E0A458', '#5B8DEF', '#C0392B', '#9B59B6', '#d8dedb'];

function pct(n: number | null): string {
  if (n == null) return '';
  const s = n >= 0 ? '▲' : '▼';
  return `${s} ${Math.abs(n).toFixed(1)}%`;
}

export default async function Dashboard({ searchParams }: { searchParams: Promise<{ point?: string; month?: string }> }) {
  const sp = await searchParams;
  const point: DashboardPoint = sp.point === 'point-1' || sp.point === 'point-2' ? sp.point : 'all';
  const month = /^\d{4}-\d{2}$/.test(sp.month ?? '') ? (sp.month as string) : currentMonth(new Date());
  const asOf = currentMonth(new Date()) === month ? new Date().toISOString().slice(0, 10) : `${month}-28`;

  const v = await loadDashboard(getPrisma(), { point, month, asOf });
  const f = v.finance;

  const maxRev = Math.max(1, ...f.byDay.map((d) => d.revenue));
  // donut conic-gradient segments
  let acc = 0;
  const segs = f.byCategory.map((c, i) => {
    const from = acc;
    acc += c.pct;
    return `${CAT_COLORS[i % CAT_COLORS.length]} ${from}% ${acc}%`;
  });
  const donut = segs.length ? `conic-gradient(${segs.join(',')})` : '#eceeec';

  const q = (p: DashboardPoint, mo: string) => `/?point=${p}&month=${mo}`;
  const showAging = point === 'all' || point === 'point-2';

  return (
    <main className={styles.shell}>
      <h1>Дашборд</h1>

      <div className={styles.filters}>
        <Link className={`${styles.pill} ${point === 'all' ? styles.pillOn : ''}`} href={q('all', month)}>Все</Link>
        {POINTS.map((p) => (
          <Link key={p.id} className={`${styles.pill} ${point === p.id ? styles.pillOn : ''}`} href={q(p.id as DashboardPoint, month)}>{p.name}</Link>
        ))}
        <span style={{ flex: 1 }} />
        <Link className={styles.month} href={q(point, prevMonth(month))}>←</Link>
        <span className={styles.month} style={{ borderColor: 'transparent' }}>{monthLabel(month)}</span>
        <Link className={styles.month} href={q(point, nextMonth(month))}>→</Link>
      </div>

      <div className={styles.kpis}>
        <div className={`${styles.kpi} ${styles.kpiLead}`}>
          <div className={styles.kpiLab}>Чистая прибыль</div>
          <div className={styles.kpiVal}>{ruble(f.profit)}</div>
          <div className={styles.delta}>{pct(f.profitDelta)}{f.profitDelta != null ? ' к пр. мес.' : ''}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLab}>Выручка · iiko</div>
          <div className={`${styles.kpiVal} ${styles.sm}`} style={{ color: 'var(--revenue)' }}>{ruble(f.revenue)}</div>
          <div className={`${styles.delta} ${(f.revenueDelta ?? 0) >= 0 ? styles.up : styles.down}`}>{pct(f.revenueDelta)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLab}>Расходы · Т-Бизнес</div>
          <div className={`${styles.kpiVal} ${styles.sm}`} style={{ color: 'var(--expense)' }}>{ruble(f.expense)}</div>
          <div className={`${styles.delta} ${(f.expenseDelta ?? 0) <= 0 ? styles.up : styles.down}`}>{pct(f.expenseDelta)}</div>
        </div>
        <div className={styles.kpi}>
          <div className={styles.kpiLab}>Маржинальность</div>
          <div className={`${styles.kpiVal} ${styles.sm}`}>{f.margin == null ? '—' : `${f.margin.toFixed(1)}%`}</div>
          <div className={styles.delta}>{f.marginDelta == null ? '' : `${f.marginDelta >= 0 ? '▲' : '▼'} ${Math.abs(f.marginDelta).toFixed(1)} п.п.`}</div>
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.panel}>
          <div className={styles.panelTtl}>Выручка по дням</div>
          {f.revenue === 0 ? (
            <p className={styles.empty}>Нет данных по выручке. Внесите её на странице <Link href="/finance">Финансы</Link>.</p>
          ) : (
            <div className={styles.bars}>
              {f.byDay.map((d) => (
                <div key={d.date} title={`${d.date}: ${ruble(d.revenue)}`} style={{ height: `${Math.max(2, (d.revenue / maxRev) * 100)}%` }} />
              ))}
            </div>
          )}
        </div>
        <div className={styles.panel}>
          <div className={styles.panelTtl}>Структура расходов</div>
          {f.byCategory.length === 0 ? (
            <p className={styles.empty}>Нет расходов за месяц.</p>
          ) : (
            <>
              <div className={styles.donut} style={{ background: donut }} />
              <div className={styles.legend}>
                {f.byCategory.map((c, i) => (
                  <div key={c.category}><i style={{ background: CAT_COLORS[i % CAT_COLORS.length] }} />{categoryLabel(c.category)} · {c.pct.toFixed(0)}% · {ruble(c.amount)}</div>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.panel}>
          <div className={styles.panelTtl}>Остатки сейчас</div>
          {v.ostatki.length === 0 ? (
            <p className={styles.empty}>Нет данных. Загрузите листы во вкладке «Загрузить».</p>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Товар</th><th>Точка</th><th className={styles.num}>Остаток</th></tr></thead>
              <tbody>
                {v.ostatki.map((o, i) => (
                  <tr key={i}><td>{o.productName}</td><td>{o.pointName}</td><td className={styles.num}>{o.ostatok}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className={styles.panel}>
          <div className={styles.panelTtl}>Залежалось · Корица</div>
          {!showAging ? (
            <p className={styles.empty}>Доступно для Корицы.</p>
          ) : v.aging.length === 0 ? (
            <p className={styles.empty}>Нет залежавшихся позиций.</p>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Десерт</th><th className={styles.num}>Возраст</th><th className={styles.num}>Ост.</th></tr></thead>
              <tbody>
                {v.aging.map((a, i) => (
                  <tr key={i} className={a.stale ? styles.stale : ''}>
                    <td>{a.productName}</td>
                    <td className={`${styles.num} ${a.stale ? styles.age : ''}`}>{a.ageDays == null ? '—' : `${a.ageDays} дн`}</td>
                    <td className={styles.num}>{a.ostatok}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className={styles.grid2}>
        <div className={styles.panel}>
          <div className={styles.panelTtl}>Списания за месяц (топ)</div>
          {v.spisaniya.length === 0 ? (
            <p className={styles.empty}>Нет списаний.</p>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Товар</th><th>Точка</th><th className={styles.num}>Списано</th></tr></thead>
              <tbody>
                {v.spisaniya.slice(0, 10).map((s, i) => (
                  <tr key={i}><td>{s.productName}</td><td>{s.pointName}</td><td className={styles.num}>{s.total}</td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
        <div className={styles.panel}>
          <div className={styles.panelTtl}>Листы на проверке</div>
          {v.sheetsQueue.length === 0 ? (
            <p className={styles.empty}>Очередь пуста.</p>
          ) : (
            <table className={styles.table}>
              <thead><tr><th>Дата</th><th>Точка</th><th>Тип</th><th></th></tr></thead>
              <tbody>
                {v.sheetsQueue.map((s) => (
                  <tr key={s.id}><td>{s.date}</td><td>{s.pointName}</td><td>{s.sheetType}</td><td><Link href={`/sheets/${s.id}`}>проверить →</Link></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint src/app/page.tsx && npm run build 2>&1 | grep -E 'Compiled|error|Error' | head`
Expected: clean; `/` builds as dynamic.

- [ ] **Step 3: Commit**

```bash
git add src/app/page.tsx
git commit -m "feat(ui): дашборд — KPI прибыли, выручка по дням, расходы, остатки, aging, списания, очередь"
```

---

## Task 8: Verify, preview e2e, deploy

**Files:** none (verification + ops)

- [ ] **Step 1: Full CI**

Run: `npx tsc --noEmit && npx eslint src && npm test 2>&1 | tail -3`
Expected: tsc clean; eslint clean; unit tests pass (prior 98 + month(5) + dashboard-aggregate(5) + ops-aggregate(4) = +14 → ~112 passed | 2 skipped).

- [ ] **Step 2: Preview e2e (controller runs this)**

Start dev server (`bakery-ops-dev`, port 3010), logged in. Seed a small dataset directly in Neon (throwaway script): a few `Revenue` + `Expense` rows for the current month (both points, several categories) + a couple of `Movement` rows (incl. a Корица dessert with an old приход for aging) + a `needs_review` sheet. Then:
1. Open `/` → snapshot: KPI cards (profit/revenue/expense/margin with deltas), revenue bars, expense donut + legend, остатки/aging/списания tables, sheets queue.
2. Click point pill «Корица» → URL `?point=point-2`, numbers + aging update.
3. Click month `←` → previous month, KPIs recompute.
4. Screenshot the dashboard (proof).
5. Delete all seeded test rows (revenue/expense/movement/sheet) from Neon; confirm dashboard shows empty states.

- [ ] **Step 3: Deploy + verify**

```bash
npx vercel deploy --prod --yes
curl -sS -o /dev/null -w "%{http_code}\n" https://bakery-ops-two.vercel.app/        # 307 (auth gate)
curl -sS -o /dev/null -w "%{http_code}\n" https://bakery-ops-two.vercel.app/sheets  # 307
git push
```

- [ ] **Step 4: Update project memory**

Edit `/Users/nkola/.claude/projects/-Users-nkola/memory/project_bakery_ops.md`: record Phase 4b done (dashboard at `/`, list at `/sheets`, brand tokens + logo, finance KPIs + revenue-by-day + expense donut + остатки/aging/списания/queue, point+month filters). Note logo file still to be added by user; Plan 3d (Telegram) remains the next phase.

---

## Self-Review

**Spec coverage (§6 dashboard, §8 computations, §3 brand):**
- §6 block 1 KPIs (profit/revenue/expense/margin + deltas) → Task 4 + Task 7. §6 block 2 revenue-by-day + expense donut → Task 4 (byDay/byCategory) + Task 7. §6 block 3 остатки + aging(Корица) → Task 5 + Task 7. §6 block 4 списания + sheets queue → Task 5/6 + Task 7. Filters point+month → Task 7 (links) + Task 3 (month math). §8 computations (sums, deltas, margin null on 0, daily revenue, category breakdown) → Task 4. §3 brand (mint tokens, logo, light style) → Task 1. Nav restructure `/`→dashboard, list→`/sheets` (§4) → Task 1/2/7.
- Variant-A decision (no daily profit) → Task 4 byDay is revenue-only; profit is monthly KPI only. ✓

**Placeholder scan:** none. Logo handles missing file via fallback. asOf uses real date for current month, month-28 for past months (so aging "as of" is within the viewed month) — explicit, not a placeholder.

**Type consistency:** `FinanceSummary` (Task 4) consumed by dashboard-repo (Task 6) + page (Task 7). `MovementRow`/`OstatokRow`/`AgingRow` (Task 5) used by repo + page. `DashboardView`/`DashboardPoint` (Task 6) → page. `month`/`monthRange`/`monthDays`/`prevMonth`/`nextMonth`/`currentMonth`/`monthLabel` (Task 3) used by repo + page. `categoryLabel` (4a), `POINTS` (4a) reused. `computeAging` signature matches Task 5 usage.

**Deferred:** logo image file (user-provided). No operational write-paths changed. iiko/Т-Бизнес API still future.

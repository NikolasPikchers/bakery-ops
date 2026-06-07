# Bakery Ops — Phase 4a: Finance Layer — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the finance data layer (revenue + categorized expenses, manual entry + CSV import) and rename the two points to Плюшкино / Корица — so net profit can be computed and the Phase 4b dashboard has data to show.

**Architecture:** Two new Prisma models (`Revenue`, `Expense`) with enums, a thin finance repository, pure validators/parsers (TDD), a `/finance` page (entry form + CSV import + journal) and its API routes, all over the existing Auth.js gate. Points are renamed in the seed (upsert-by-id) and applied to the live DB. No existing Phase 1–3c behavior changes.

**Tech Stack:** Next.js 16 (App Router), React 19, Prisma 7 (driver adapter, `getPrisma()`), Neon Postgres, zod v4, Vitest. Money as `Decimal(12,2)`, ₽ only.

**Spec:** `docs/superpowers/specs/2026-06-07-bakery-ops-phase4-dashboard-finance-design.md` (this plan = §10 "4a"). The dashboard UI + brand styling + nav restructure (`/`→dashboard, list→`/sheets`) are **Phase 4b** (separate plan).

---

## Decisions locked

- **Points keep ids** `point-1` / `point-2`; only `name` changes (Плюшкино / Корица). Seed upserts **by id** (not by name) so the rename updates the existing rows.
- **Expense categories** (fixed enum): `produkty` Продукты · `arenda` Аренда · `fot` ФОТ · `kommunalka` Коммуналка · `nalogi` Налоги · `prochee` Прочее.
- **Revenue** is one row per (point, day) → upsert. **Expense** allows many rows per (point, day) → plain create.
- **Monthly fixed costs** (rent/ФОТ/taxes) are entered as ordinary expense records dated within the month; the dashboard (4b) only uses them in the monthly total — no daily allocation.
- **CSV v1 format** (documented, simple): revenue `date,point,amount[,note]`; expense `date,point,category,amount[,note]`. Date `YYYY-MM-DD` or `DD.MM.YYYY`; point by id (`point-1`) or name (`Плюшкино`/`Корица`); amount with `.` or `,` decimal; unknown expense category → `prochee` (original kept in note). Invalid rows are reported, not imported.
- Money passed to Prisma as JS `number`; read back via `Number(decimal)`.
- `/finance` page protected by middleware; `/api/finance*` self-guard with `auth()`.

---

## File Structure

**New — lib (unit-tested):**
- `src/lib/domain/points.ts` — `POINTS` constant, `pointName(id)`, `pointIdFromInput(s)`.
- `src/lib/finance/categories.ts` — `EXPENSE_CATEGORIES`, keys, `categoryLabel`, `categoryFromInput`.
- `src/lib/finance/finance-input.ts` — `parseFinanceEntry(body)` (zod discriminated union).
- `src/lib/finance/finance-csv.ts` — `parseRevenueCsv(text)`, `parseExpenseCsv(text)`.

**New — db:**
- `src/lib/db/finance-repo.ts` — upsert/create/list/delete for revenue & expenses.

**New — app:**
- `src/app/finance/page.tsx` — server page (loads journal + points + categories).
- `src/app/finance/FinanceForms.tsx` — client (entry form + CSV import + journal w/ delete).
- `src/app/api/finance/route.ts` — POST (create) + GET (list).
- `src/app/api/finance/[id]/route.ts` — DELETE (?type=revenue|expense).
- `src/app/api/finance/import/route.ts` — POST (CSV bulk import).

**Modified:**
- `prisma/schema.prisma` — add enums + Revenue + Expense + Point relations.
- `prisma/seed.ts` — rename points (upsert-by-id, use POINTS).
- `src/app/layout.tsx` — add "Финансы" nav link.
- `src/app/upload/page.tsx` — point option labels → Плюшкино / Корица.

---

## Task 1: Shared POINTS constant

**Files:**
- Create: `src/lib/domain/points.ts`
- Test: `src/lib/domain/points.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/domain/points.test.ts
import { describe, it, expect } from 'vitest';
import { POINTS, pointName, pointIdFromInput } from './points';

describe('points', () => {
  it('has exactly the two bakery points with ids and ru names', () => {
    expect(POINTS).toEqual([
      { id: 'point-1', name: 'Плюшкино' },
      { id: 'point-2', name: 'Корица' },
    ]);
  });
  it('pointName maps id to name, falls back to id', () => {
    expect(pointName('point-1')).toBe('Плюшкино');
    expect(pointName('point-2')).toBe('Корица');
    expect(pointName('unknown')).toBe('unknown');
  });
  it('pointIdFromInput resolves by id or by name (case-insensitive)', () => {
    expect(pointIdFromInput('point-1')).toBe('point-1');
    expect(pointIdFromInput('Корица')).toBe('point-2');
    expect(pointIdFromInput('  плюшкино ')).toBe('point-1');
    expect(pointIdFromInput('нет такой')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/domain/points.test.ts`
Expected: FAIL — cannot find module `./points`.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/domain/points.ts
export const POINTS = [
  { id: 'point-1', name: 'Плюшкино' },
  { id: 'point-2', name: 'Корица' },
] as const;

export type PointId = (typeof POINTS)[number]['id'];

export function pointName(id: string): string {
  return POINTS.find((p) => p.id === id)?.name ?? id;
}

/** Резолвит точку по id ('point-1') или имени ('Плюшкино'/'Корица'), регистронезависимо. */
export function pointIdFromInput(s: string): PointId | null {
  const t = s.trim().toLowerCase();
  const byId = POINTS.find((p) => p.id.toLowerCase() === t);
  if (byId) return byId.id;
  const byName = POINTS.find((p) => p.name.toLowerCase() === t);
  return byName ? byName.id : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/domain/points.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/domain/points.ts src/lib/domain/points.test.ts
git commit -m "feat(domain): константа точек Плюшкино/Корица + резолвер"
```

---

## Task 2: Rename points (seed + live DB)

**Files:**
- Modify: `prisma/seed.ts`

The current seed upserts points **by name**, which can't rename. Change it to upsert **by id** using `POINTS`, then run the seed against the live DB to rename the two existing rows.

- [ ] **Step 1: Edit the points block in `prisma/seed.ts`**

Replace the existing points array + loop:

```ts
const points = [
  { id: 'point-1', name: 'Точка 1' },
  { id: 'point-2', name: 'Точка 2' },
];
for (const p of points) {
  await prisma.point.upsert({ where: { name: p.name }, update: {}, create: p });
}
```

with (import `POINTS` at the top of the file: `import { POINTS } from '../src/lib/catalog/seed-catalog';` is WRONG — import from points):

```ts
// at top, with the other imports:
import { POINTS } from '../src/lib/domain/points';

// ...in main(), replacing the old points block:
for (const p of POINTS) {
  await prisma.point.upsert({
    where: { id: p.id },
    update: { name: p.name },
    create: { id: p.id, name: p.name },
  });
}
```

- [ ] **Step 2: Apply to the live DB**

Run (loads .env so DATABASE_URL is set; pooled URL is fine for this upsert):
```bash
set -a; . ./.env; set +a
npx tsx prisma/seed.ts
```
Expected: prints `Seeded: 2 points, 28 products`.

- [ ] **Step 3: Verify the rename took effect**

Run:
```bash
set -a; . ./.env; set +a
npx tsx -e "import('@prisma/client').then(async m=>{const {PrismaPg}=await import('@prisma/adapter-pg');const p=new m.PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});console.log(await p.point.findMany({orderBy:{id:'asc'},select:{id:true,name:true}}));await p.\$disconnect();})"
```
Expected: `[ { id: 'point-1', name: 'Плюшкино' }, { id: 'point-2', name: 'Корица' } ]`

- [ ] **Step 4: Verify tests still pass + types**

Run: `npx tsc --noEmit && npm test 2>&1 | tail -3`
Expected: tsc clean; suite green (seed.ts is not imported by tests; no count change).

- [ ] **Step 5: Commit**

```bash
git add prisma/seed.ts
git commit -m "feat(db): переименование точек в Плюшкино/Корица (upsert по id)"
```

---

## Task 3: Prisma models — Revenue, Expense, enums

**Files:**
- Modify: `prisma/schema.prisma`

- [ ] **Step 1: Add enums** (after the existing `enum UnknownLineStatus { ... }` block):

```prisma
enum RevenueSource {
  manual
  import
}

enum ExpenseSource {
  manual
  import
}

enum ExpenseCategory {
  produkty
  arenda
  fot
  kommunalka
  nalogi
  prochee
}
```

- [ ] **Step 2: Add models** (at the end of the file):

```prisma
model Revenue {
  id        String        @id @default(cuid())
  pointId   String
  point     Point         @relation(fields: [pointId], references: [id])
  date      DateTime      @db.Date
  amount    Decimal       @db.Decimal(12, 2)
  source    RevenueSource @default(manual)
  note      String?
  createdBy String?
  createdAt DateTime      @default(now())
  updatedAt DateTime      @updatedAt

  @@unique([pointId, date])
  @@index([date])
}

model Expense {
  id        String          @id @default(cuid())
  pointId   String
  point     Point           @relation(fields: [pointId], references: [id])
  date      DateTime        @db.Date
  amount    Decimal         @db.Decimal(12, 2)
  category  ExpenseCategory
  source    ExpenseSource   @default(manual)
  note      String?
  createdBy String?
  createdAt DateTime        @default(now())
  updatedAt DateTime        @updatedAt

  @@index([pointId, date])
  @@index([date])
}
```

- [ ] **Step 3: Add relations to the `Point` model** — inside `model Point { ... }`, after `sheets    Sheet[]`, add:

```prisma
  revenues  Revenue[]
  expenses  Expense[]
```

- [ ] **Step 4: Validate + generate + push schema to live DB**

Run:
```bash
npx prisma validate
set -a; . ./.env; set +a
DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma db push
npx prisma generate
```
Expected: validate OK; `db push` reports the two new tables created (on the UNPOOLED/direct URL — pgBouncer pooled is not for DDL); generate OK.

- [ ] **Step 5: Verify the client knows the new models + types compile**

Run:
```bash
npx tsc --noEmit
set -a; . ./.env; set +a
npx tsx -e "import('@prisma/client').then(async m=>{const {PrismaPg}=await import('@prisma/adapter-pg');const p=new m.PrismaClient({adapter:new PrismaPg({connectionString:process.env.DATABASE_URL})});console.log('revenue rows:', await p.revenue.count(), 'expense rows:', await p.expense.count());await p.\$disconnect();})"
```
Expected: tsc clean; prints `revenue rows: 0 expense rows: 0`.

- [ ] **Step 6: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(db): модели Revenue/Expense + enums (источник, категории расходов)"
```

---

## Task 4: Expense categories dictionary

**Files:**
- Create: `src/lib/finance/categories.ts`
- Test: `src/lib/finance/categories.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/finance/categories.test.ts
import { describe, it, expect } from 'vitest';
import { EXPENSE_CATEGORIES, EXPENSE_CATEGORY_KEYS, categoryLabel, categoryFromInput } from './categories';

describe('expense categories', () => {
  it('exposes the six fixed categories in order', () => {
    expect(EXPENSE_CATEGORY_KEYS).toEqual(['produkty', 'arenda', 'fot', 'kommunalka', 'nalogi', 'prochee']);
    expect(EXPENSE_CATEGORIES.find((c) => c.key === 'fot')?.label).toBe('ФОТ');
  });
  it('categoryLabel maps key to ru label', () => {
    expect(categoryLabel('nalogi')).toBe('Налоги');
    expect(categoryLabel('produkty')).toBe('Продукты');
  });
  it('categoryFromInput resolves by key or ru label (case-insensitive)', () => {
    expect(categoryFromInput('arenda')).toBe('arenda');
    expect(categoryFromInput('Аренда')).toBe('arenda');
    expect(categoryFromInput('  фот ')).toBe('fot');
  });
  it('categoryFromInput returns null for unknown', () => {
    expect(categoryFromInput('зарплата директора')).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/finance/categories.test.ts`
Expected: FAIL — cannot find module `./categories`.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/finance/categories.ts
export const EXPENSE_CATEGORIES = [
  { key: 'produkty', label: 'Продукты' },
  { key: 'arenda', label: 'Аренда' },
  { key: 'fot', label: 'ФОТ' },
  { key: 'kommunalka', label: 'Коммуналка' },
  { key: 'nalogi', label: 'Налоги' },
  { key: 'prochee', label: 'Прочее' },
] as const;

export type ExpenseCategoryKey = (typeof EXPENSE_CATEGORIES)[number]['key'];

export const EXPENSE_CATEGORY_KEYS = EXPENSE_CATEGORIES.map((c) => c.key) as [
  ExpenseCategoryKey,
  ...ExpenseCategoryKey[],
];

export function categoryLabel(key: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

/** Резолвит категорию по ключу ('arenda') или рус. метке ('Аренда'), регистронезависимо. */
export function categoryFromInput(s: string): ExpenseCategoryKey | null {
  const t = s.trim().toLowerCase();
  const c = EXPENSE_CATEGORIES.find(
    (x) => x.key.toLowerCase() === t || x.label.toLowerCase() === t,
  );
  return c ? c.key : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/finance/categories.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/categories.ts src/lib/finance/categories.test.ts
git commit -m "feat(finance): словарь категорий расходов"
```

---

## Task 5: Finance entry validator (pure, zod)

**Files:**
- Create: `src/lib/finance/finance-input.ts`
- Test: `src/lib/finance/finance-input.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/finance/finance-input.test.ts
import { describe, it, expect } from 'vitest';
import { parseFinanceEntry } from './finance-input';

describe('parseFinanceEntry', () => {
  it('parses a revenue entry', () => {
    const r = parseFinanceEntry({ type: 'revenue', pointId: 'point-1', date: '2026-06-05', amount: 18500 });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.value).toMatchObject({ type: 'revenue', pointId: 'point-1', amount: 18500 });
  });
  it('parses an expense entry with category and note', () => {
    const r = parseFinanceEntry({ type: 'expense', pointId: 'point-2', date: '2026-06-05', amount: 4200, category: 'produkty', note: 'мука' });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.type === 'expense') expect(r.value.category).toBe('produkty');
  });
  it('rejects an unknown point', () => {
    expect(parseFinanceEntry({ type: 'revenue', pointId: 'x', date: '2026-06-05', amount: 1 }).ok).toBe(false);
  });
  it('rejects a non-positive amount', () => {
    expect(parseFinanceEntry({ type: 'revenue', pointId: 'point-1', date: '2026-06-05', amount: 0 }).ok).toBe(false);
  });
  it('rejects a bad date', () => {
    expect(parseFinanceEntry({ type: 'revenue', pointId: 'point-1', date: '05.06.2026', amount: 1 }).ok).toBe(false);
  });
  it('rejects an expense with an unknown category', () => {
    expect(parseFinanceEntry({ type: 'expense', pointId: 'point-1', date: '2026-06-05', amount: 1, category: 'nope' }).ok).toBe(false);
  });
  it('rejects an expense without a category', () => {
    expect(parseFinanceEntry({ type: 'expense', pointId: 'point-1', date: '2026-06-05', amount: 1 }).ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/finance/finance-input.test.ts`
Expected: FAIL — cannot find module `./finance-input`.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/finance/finance-input.ts
import { z } from 'zod';
import { EXPENSE_CATEGORY_KEYS } from './categories';

const POINT_IDS = ['point-1', 'point-2'] as const;

const baseShape = {
  pointId: z.enum(POINT_IDS),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  note: z.string().optional(),
};

const schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('revenue'), ...baseShape }),
  z.object({ type: z.literal('expense'), ...baseShape, category: z.enum(EXPENSE_CATEGORY_KEYS) }),
]);

export type FinanceEntry = z.infer<typeof schema>;
export type ParseResult = { ok: true; value: FinanceEntry } | { ok: false; error: string };

export function parseFinanceEntry(body: unknown): ParseResult {
  const r = schema.safeParse(body);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.message };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/finance/finance-input.test.ts`
Expected: PASS (7 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/finance-input.ts src/lib/finance/finance-input.test.ts
git commit -m "feat(finance): валидация записи выручки/расхода"
```

---

## Task 6: Finance CSV parser (pure)

**Files:**
- Create: `src/lib/finance/finance-csv.ts`
- Test: `src/lib/finance/finance-csv.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/finance/finance-csv.test.ts
import { describe, it, expect } from 'vitest';
import { parseRevenueCsv, parseExpenseCsv } from './finance-csv';

describe('parseRevenueCsv', () => {
  it('parses rows, normalizes date/point/amount, collects errors', () => {
    const csv = [
      'date,point,amount,note',
      '2026-06-05,Плюшкино,18500,суббота',
      '06.06.2026,point-2,"12 300,50"',
      'bad,Корица,100',
      '2026-06-07,НетТакой,100',
    ].join('\n');
    const r = parseRevenueCsv(csv);
    expect(r.rows).toEqual([
      { pointId: 'point-1', date: '2026-06-05', amount: 18500, note: 'суббота' },
      { pointId: 'point-2', date: '2026-06-06', amount: 12300.5, note: undefined },
    ]);
    expect(r.errors.map((e) => e.line)).toEqual([4, 5]);
  });
});

describe('parseExpenseCsv', () => {
  it('parses category by label/key; unknown category -> prochee with note', () => {
    const csv = [
      'date,point,category,amount,note',
      '2026-06-05,Плюшкино,Продукты,4200,мука',
      '2026-06-05,Корица,fot,30000',
      '2026-06-05,Плюшкино,Реклама,1500',
    ].join('\n');
    const r = parseExpenseCsv(csv);
    expect(r.rows[0]).toEqual({ pointId: 'point-1', date: '2026-06-05', amount: 4200, category: 'produkty', note: 'мука' });
    expect(r.rows[1]).toMatchObject({ category: 'fot', amount: 30000 });
    expect(r.rows[2]).toMatchObject({ category: 'prochee' });
    expect(r.rows[2].note).toContain('Реклама');
    expect(r.errors).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/finance/finance-csv.test.ts`
Expected: FAIL — cannot find module `./finance-csv`.

- [ ] **Step 3: Write implementation**

```ts
// src/lib/finance/finance-csv.ts
import { pointIdFromInput } from '@/lib/domain/points';
import { categoryFromInput, type ExpenseCategoryKey } from './categories';

export type RevenueCsvRow = { pointId: string; date: string; amount: number; note?: string };
export type ExpenseCsvRow = { pointId: string; date: string; amount: number; category: ExpenseCategoryKey; note?: string };
export type CsvError = { line: number; reason: string };
export type CsvResult<T> = { rows: T[]; errors: CsvError[] };

function normDate(s: string): string | null {
  const t = s.trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t;
  const m = t.match(/^(\d{2})\.(\d{2})\.(\d{4})$/);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : null;
}

function normAmount(s: string): number | null {
  const t = s.trim().replace(/\s/g, '').replace(',', '.');
  if (t === '') return null;
  const n = Number(t);
  return Number.isFinite(n) && n > 0 ? n : null;
}

// Минимальный CSV-сплиттер строки: поддерживает кавычки вокруг поля (для запятой в числе/заметке).
function splitCsvLine(line: string): string[] {
  const out: string[] = [];
  let cur = '';
  let inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQ) {
      if (ch === '"') inQ = false;
      else cur += ch;
    } else if (ch === '"') inQ = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out.map((c) => c.trim());
}

function rows(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0)
    .map(splitCsvLine);
}

export function parseRevenueCsv(text: string): CsvResult<RevenueCsvRow> {
  const all = rows(text);
  const out: RevenueCsvRow[] = [];
  const errors: CsvError[] = [];
  // строка 1 — заголовок; данные с физической строки 2
  for (let i = 1; i < all.length; i++) {
    const line = i + 1;
    const [dateRaw = '', pointRaw = '', amountRaw = '', noteRaw = ''] = all[i];
    const date = normDate(dateRaw);
    const pointId = pointIdFromInput(pointRaw);
    const amount = normAmount(amountRaw);
    if (!date) { errors.push({ line, reason: `Неверная дата: "${dateRaw}"` }); continue; }
    if (!pointId) { errors.push({ line, reason: `Неизвестная точка: "${pointRaw}"` }); continue; }
    if (amount === null) { errors.push({ line, reason: `Неверная сумма: "${amountRaw}"` }); continue; }
    out.push({ pointId, date, amount, note: noteRaw.trim() || undefined });
  }
  return { rows: out, errors };
}

export function parseExpenseCsv(text: string): CsvResult<ExpenseCsvRow> {
  const all = rows(text);
  const out: ExpenseCsvRow[] = [];
  const errors: CsvError[] = [];
  for (let i = 1; i < all.length; i++) {
    const line = i + 1;
    const [dateRaw = '', pointRaw = '', catRaw = '', amountRaw = '', noteRaw = ''] = all[i];
    const date = normDate(dateRaw);
    const pointId = pointIdFromInput(pointRaw);
    const amount = normAmount(amountRaw);
    if (!date) { errors.push({ line, reason: `Неверная дата: "${dateRaw}"` }); continue; }
    if (!pointId) { errors.push({ line, reason: `Неизвестная точка: "${pointRaw}"` }); continue; }
    if (amount === null) { errors.push({ line, reason: `Неверная сумма: "${amountRaw}"` }); continue; }
    const matched = categoryFromInput(catRaw);
    const category: ExpenseCategoryKey = matched ?? 'prochee';
    const baseNote = noteRaw.trim();
    const note = matched ? (baseNote || undefined) : `категория: ${catRaw.trim()}${baseNote ? ` · ${baseNote}` : ''}`;
    out.push({ pointId, date, amount, category, note });
  }
  return { rows: out, errors };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/finance/finance-csv.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/finance/finance-csv.ts src/lib/finance/finance-csv.test.ts
git commit -m "feat(finance): парсер CSV выручки и расходов"
```

---

## Task 7: Finance repository

**Files:**
- Create: `src/lib/db/finance-repo.ts`

Thin Prisma wrappers (verified by `tsc` + the preview e2e in Task 10). No unit test (DB-bound).

- [ ] **Step 1: Write the implementation**

```ts
// src/lib/db/finance-repo.ts
import type { PrismaClient } from '@prisma/client';
import { toDbDate } from './dates';

type Source = 'manual' | 'import';

export type RevenueInput = { pointId: string; date: string; amount: number; source: Source; note?: string | null; createdBy?: string | null };
export type ExpenseInput = { pointId: string; date: string; amount: number; category: string; source: Source; note?: string | null; createdBy?: string | null };

export async function upsertRevenue(prisma: PrismaClient, r: RevenueInput) {
  const date = toDbDate(r.date);
  return prisma.revenue.upsert({
    where: { pointId_date: { pointId: r.pointId, date } },
    create: { pointId: r.pointId, date, amount: r.amount, source: r.source, note: r.note ?? undefined, createdBy: r.createdBy ?? undefined },
    update: { amount: r.amount, source: r.source, note: r.note ?? undefined },
  });
}

export async function createExpense(prisma: PrismaClient, e: ExpenseInput) {
  return prisma.expense.create({
    data: {
      pointId: e.pointId,
      date: toDbDate(e.date),
      amount: e.amount,
      // category — строковый ключ enum ExpenseCategory; Prisma примет валидное значение enum.
      category: e.category as never,
      source: e.source,
      note: e.note ?? undefined,
      createdBy: e.createdBy ?? undefined,
    },
  });
}

export type FinanceEntryView = {
  id: string;
  type: 'revenue' | 'expense';
  date: string; // ISO yyyy-mm-dd
  pointName: string;
  amount: number;
  category: string | null;
  source: string;
};

export async function listFinanceEntries(prisma: PrismaClient, limit = 50): Promise<FinanceEntryView[]> {
  const [rev, exp] = await Promise.all([
    prisma.revenue.findMany({ orderBy: { date: 'desc' }, take: limit, include: { point: { select: { name: true } } } }),
    prisma.expense.findMany({ orderBy: { date: 'desc' }, take: limit, include: { point: { select: { name: true } } } }),
  ]);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const items: (FinanceEntryView & { _t: number })[] = [
    ...rev.map((r) => ({ id: r.id, type: 'revenue' as const, date: iso(r.date), pointName: r.point.name, amount: Number(r.amount), category: null, source: r.source, _t: r.date.getTime() })),
    ...exp.map((e) => ({ id: e.id, type: 'expense' as const, date: iso(e.date), pointName: e.point.name, amount: Number(e.amount), category: e.category, source: e.source, _t: e.date.getTime() })),
  ];
  items.sort((a, b) => b._t - a._t);
  return items.slice(0, limit).map(({ _t, ...rest }) => rest);
}

export async function deleteRevenue(prisma: PrismaClient, id: string) {
  await prisma.revenue.delete({ where: { id } });
}
export async function deleteExpense(prisma: PrismaClient, id: string) {
  await prisma.expense.delete({ where: { id } });
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors. (If `category: e.category as never` is rejected, use `as 'produkty'` — but `never` cast satisfies the generated enum input type; keep it.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/db/finance-repo.ts
git commit -m "feat(db): репозиторий финансов (выручка/расходы: upsert/create/list/delete)"
```

---

## Task 8: Finance API routes

**Files:**
- Create: `src/app/api/finance/route.ts`
- Create: `src/app/api/finance/[id]/route.ts`
- Create: `src/app/api/finance/import/route.ts`

Thin wiring over the validator (Task 5), CSV parser (Task 6) and repo (Task 7); auth-guarded. Verified by build + Task 10 e2e.

- [ ] **Step 1: Write `src/app/api/finance/route.ts`**

```ts
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { parseFinanceEntry } from '@/lib/finance/finance-input';
import { upsertRevenue, createExpense, listFinanceEntries } from '@/lib/db/finance-repo';

export const runtime = 'nodejs';

export async function GET() {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const entries = await listFinanceEntries(getPrisma(), 50);
  return Response.json({ entries });
}

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const parsed = parseFinanceEntry(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const prisma = getPrisma();
  const createdBy = session.user?.name ?? null;
  const v = parsed.value;
  if (v.type === 'revenue') {
    await upsertRevenue(prisma, { pointId: v.pointId, date: v.date, amount: v.amount, source: 'manual', note: v.note ?? null, createdBy });
  } else {
    await createExpense(prisma, { pointId: v.pointId, date: v.date, amount: v.amount, category: v.category, source: 'manual', note: v.note ?? null, createdBy });
  }
  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Write `src/app/api/finance/[id]/route.ts`**

```ts
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { deleteRevenue, deleteExpense } from '@/lib/db/finance-repo';

export const runtime = 'nodejs';

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const type = new URL(req.url).searchParams.get('type');
  const prisma = getPrisma();
  if (type === 'revenue') await deleteRevenue(prisma, id);
  else if (type === 'expense') await deleteExpense(prisma, id);
  else return Response.json({ error: 'Укажите ?type=revenue|expense' }, { status: 400 });
  return Response.json({ ok: true });
}
```

- [ ] **Step 3: Write `src/app/api/finance/import/route.ts`**

```ts
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { parseRevenueCsv, parseExpenseCsv } from '@/lib/finance/finance-csv';
import { upsertRevenue, createExpense } from '@/lib/db/finance-repo';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const type = form.get('type');
  const fileEntry = form.get('file');
  const file = fileEntry instanceof File ? fileEntry : null;
  if (type !== 'revenue' && type !== 'expense') return Response.json({ error: 'type должен быть revenue|expense' }, { status: 400 });
  if (!file) return Response.json({ error: 'Нет файла' }, { status: 400 });

  const text = await file.text();
  const prisma = getPrisma();
  const createdBy = session.user?.name ?? null;

  if (type === 'revenue') {
    const { rows, errors } = parseRevenueCsv(text);
    for (const r of rows) await upsertRevenue(prisma, { ...r, source: 'import', note: r.note ?? null, createdBy });
    return Response.json({ imported: rows.length, errors });
  } else {
    const { rows, errors } = parseExpenseCsv(text);
    for (const r of rows) await createExpense(prisma, { ...r, source: 'import', note: r.note ?? null, createdBy });
    return Response.json({ imported: rows.length, errors });
  }
}
```

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit && npm run build 2>&1 | grep -E '/api/finance|error|Error' | head`
Expected: succeeds; `/api/finance`, `/api/finance/[id]`, `/api/finance/import` appear as `ƒ` routes.

- [ ] **Step 5: Commit**

```bash
git add src/app/api/finance
git commit -m "feat(api): финансы — создание/список/удаление/импорт CSV"
```

---

## Task 9: Finance page + forms + nav

**Files:**
- Create: `src/app/finance/page.tsx`
- Create: `src/app/finance/FinanceForms.tsx`
- Modify: `src/app/layout.tsx` (nav link)
- Modify: `src/app/upload/page.tsx` (point labels)

- [ ] **Step 1: Write the server page `src/app/finance/page.tsx`**

```tsx
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
```

- [ ] **Step 2: Write the client component `src/app/finance/FinanceForms.tsx`**

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../ui.module.css';
import { POINTS } from '@/lib/domain/points';
import { EXPENSE_CATEGORIES, categoryLabel } from '@/lib/finance/categories';
import type { FinanceEntryView } from '@/lib/db/finance-repo';

const ruble = (n: number) => `₽ ${n.toLocaleString('ru-RU')}`;

export function FinanceForms({ entries }: { entries: FinanceEntryView[] }) {
  const router = useRouter();
  const [type, setType] = useState<'revenue' | 'expense'>('revenue');
  const [pointId, setPointId] = useState('point-1');
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [category, setCategory] = useState('produkty');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');

  const [impType, setImpType] = useState<'revenue' | 'expense'>('revenue');
  const [impFile, setImpFile] = useState<File | null>(null);
  const [impMsg, setImpMsg] = useState('');

  async function submitEntry(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg('');
    const amt = Number(amount.replace(',', '.'));
    if (!date || !(amt > 0)) {
      setBusy(false);
      setMsg('Укажите дату и сумму > 0');
      return;
    }
    const body =
      type === 'revenue'
        ? { type, pointId, date, amount: amt, note: note || undefined }
        : { type, pointId, date, amount: amt, category, note: note || undefined };
    const res = await fetch('/api/finance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) {
      setMsg(data.error ?? 'Ошибка');
      return;
    }
    setMsg('Сохранено');
    setAmount('');
    setNote('');
    router.refresh();
  }

  async function submitImport(e: React.FormEvent) {
    e.preventDefault();
    if (!impFile) {
      setImpMsg('Выберите CSV-файл');
      return;
    }
    setImpMsg('Импорт…');
    const fd = new FormData();
    fd.set('type', impType);
    fd.set('file', impFile);
    const res = await fetch('/api/finance/import', { method: 'POST', body: fd });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      setImpMsg(data.error ?? 'Ошибка импорта');
      return;
    }
    const errs = (data.errors ?? []) as { line: number; reason: string }[];
    setImpMsg(`Импортировано: ${data.imported}.` + (errs.length ? ` Пропущено строк: ${errs.length} (${errs.map((x) => `стр.${x.line}`).join(', ')})` : ''));
    router.refresh();
  }

  async function remove(item: FinanceEntryView) {
    if (busy) return;
    setBusy(true);
    await fetch(`/api/finance/${item.id}?type=${item.type}`, { method: 'DELETE' });
    setBusy(false);
    router.refresh();
  }

  return (
    <div style={{ display: 'grid', gap: 24 }}>
      <section className={styles.card} style={{ margin: 0, maxWidth: 'none' }}>
        <h3>Внести запись</h3>
        <form onSubmit={submitEntry} style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, alignItems: 'end' }}>
          <div className={styles.field}>
            <label>Тип</label>
            <select value={type} onChange={(e) => setType(e.target.value as 'revenue' | 'expense')}>
              <option value="revenue">Выручка</option>
              <option value="expense">Расход</option>
            </select>
          </div>
          <div className={styles.field}>
            <label>Точка</label>
            <select value={pointId} onChange={(e) => setPointId(e.target.value)}>
              {POINTS.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>
          <div className={styles.field}>
            <label>Дата</label>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </div>
          <div className={styles.field}>
            <label>Сумма, ₽</label>
            <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
          </div>
          {type === 'expense' && (
            <div className={styles.field}>
              <label>Категория</label>
              <select value={category} onChange={(e) => setCategory(e.target.value)}>
                {EXPENSE_CATEGORIES.map((c) => (
                  <option key={c.key} value={c.key}>{c.label}</option>
                ))}
              </select>
            </div>
          )}
          <div className={styles.field}>
            <label>Заметка</label>
            <input value={note} onChange={(e) => setNote(e.target.value)} />
          </div>
          <button className={styles.btn} disabled={busy}>Сохранить</button>
        </form>
        {msg && <p style={{ marginTop: 8 }}>{msg}</p>}
      </section>

      <section className={styles.card} style={{ margin: 0, maxWidth: 'none' }}>
        <h3>Импорт CSV</h3>
        <p style={{ fontSize: 13, color: '#666' }}>
          Выручка: <code>date,point,amount[,note]</code>. Расходы: <code>date,point,category,amount[,note]</code>.
          Дата ГГГГ-ММ-ДД или ДД.ММ.ГГГГ; точка — Плюшкино/Корица или point-1/point-2.
        </p>
        <form onSubmit={submitImport} style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
          <select value={impType} onChange={(e) => setImpType(e.target.value as 'revenue' | 'expense')}>
            <option value="revenue">Выручка</option>
            <option value="expense">Расходы</option>
          </select>
          <input type="file" accept=".csv,text/csv" onChange={(e) => setImpFile(e.target.files?.[0] ?? null)} />
          <button className={styles.btn}>Импортировать</button>
        </form>
        {impMsg && <p style={{ marginTop: 8 }}>{impMsg}</p>}
      </section>

      <section className={styles.card} style={{ margin: 0, maxWidth: 'none' }}>
        <h3>Последние записи</h3>
        {entries.length === 0 ? (
          <p>Пока нет записей.</p>
        ) : (
          <table className={styles.table}>
            <thead>
              <tr><th>Дата</th><th>Точка</th><th>Тип</th><th>Категория</th><th>Сумма</th><th>Источник</th><th></th></tr>
            </thead>
            <tbody>
              {entries.map((it) => (
                <tr key={`${it.type}-${it.id}`}>
                  <td>{it.date}</td>
                  <td>{it.pointName}</td>
                  <td>{it.type === 'revenue' ? 'Выручка' : 'Расход'}</td>
                  <td>{it.category ? categoryLabel(it.category) : '—'}</td>
                  <td>{ruble(it.amount)}</td>
                  <td>{it.source === 'import' ? 'CSV' : 'вручную'}</td>
                  <td><button className={`${styles.btn} ${styles.btnGhost}`} disabled={busy} onClick={() => remove(it)}>Удалить</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Add the nav link in `src/app/layout.tsx`**

Replace:
```tsx
            <Link href="/">Остатки</Link>
            <Link href="/upload">Загрузить лист</Link>
```
with:
```tsx
            <Link href="/">Остатки</Link>
            <Link href="/finance">Финансы</Link>
            <Link href="/upload">Загрузить лист</Link>
```

- [ ] **Step 4: Update point labels in `src/app/upload/page.tsx`**

Replace:
```tsx
            <option value="point-1">Точка 1</option>
            <option value="point-2">Точка 2</option>
```
with:
```tsx
            <option value="point-1">Плюшкино</option>
            <option value="point-2">Корица</option>
```

- [ ] **Step 5: Verify build + lint + types**

Run: `npx tsc --noEmit && npx eslint src/app/finance src/app/layout.tsx src/app/upload/page.tsx && npm run build 2>&1 | grep -E '/finance|error|Error' | head`
Expected: clean; `/finance` appears in route table.

- [ ] **Step 6: Commit**

```bash
git add src/app/finance src/app/layout.tsx src/app/upload/page.tsx
git commit -m "feat(ui): страница Финансы (ввод + импорт CSV + журнал) + навигация"
```

---

## Task 10: Verify, preview e2e, deploy

**Files:** none (verification + ops)

- [ ] **Step 1: Full CI**

Run: `npx tsc --noEmit && npx eslint src && npm test 2>&1 | tail -3`
Expected: tsc clean; eslint clean; all unit tests pass (prior 82 + new: points(3) + categories(4) + finance-input(7) + finance-csv(2) = +16 → ~98 passed | 2 skipped).

- [ ] **Step 2: Preview e2e (controller runs this)**

Start the dev server (`preview_start` config `bakery-ops-dev`, port 3010) and, logged in:
1. Navigate `/finance` → snapshot: entry form + CSV import + empty journal.
2. Add a **revenue** (Плюшкино, a date, 18500) → "Сохранено"; journal shows the row.
3. Add an **expense** (Корица, Продукты, 4200) → journal shows it.
4. Import a small revenue CSV via `preview_eval` POST to `/api/finance/import` (FormData with a Blob CSV) → expect `{imported, errors}`; journal refreshes.
5. Delete a row → it disappears.
6. Verify in DB (node one-liner): `revenue.count` / `expense.count` reflect the adds minus delete; point names are Плюшкино/Корица.
7. Clean up test finance rows from the DB after.

- [ ] **Step 3: Deploy + verify**

```bash
npx vercel deploy --prod --yes
curl -sS -o /dev/null -w "%{http_code}\n" https://bakery-ops-two.vercel.app/finance   # expect 307 (auth gate)
git push
```

- [ ] **Step 4: Update project memory**

Edit `/Users/nkola/.claude/projects/-Users-nkola/memory/project_bakery_ops.md`: record Phase 4a done (points renamed Плюшкино/Корица; Revenue/Expense models + enums pushed to Neon; finance repo + validators + CSV parser; `/finance` page + API; nav link). Note 4b (dashboard + brand) is next.

---

## Self-Review

**Spec coverage (§ of phase4 spec):**
- §3 brand point names → Task 1/2 (Плюшкино/Корица). §5 data model (Revenue unique point+date, Expense many, enums incl. nalogi) → Task 3. Category dict → Task 4. §7 entry form + CSV import + journal + `/api/finance` → Tasks 5,6,7,8,9. CSV formats (§7) → Task 6 + page hints (Task 9). Manual revenue upsert / expense create (§5) → Task 7/8. Auth (§4) → API self-guard (Task 8) + middleware (existing). Nav "Финансы" (§4) → Task 9. Dashboard `/`, brand styling, `/sheets` move (§6, §3) → **Phase 4b (out of scope here)** — explicitly deferred.

**Placeholder scan:** none. CSV "documented format" is concrete (Task 6 + page). `category as never` cast is explained with a fallback note.

**Type consistency:** `POINTS`/`PointId` (Task 1) reused in finance-csv (Task 6), finance-input enum of point ids (Task 5), FinanceForms (Task 9). `ExpenseCategoryKey`/`EXPENSE_CATEGORY_KEYS` (Task 4) → finance-input (Task 5) + finance-csv (Task 6). `RevenueInput`/`ExpenseInput`/`FinanceEntryView` (Task 7) → API (Task 8) + page (Task 9). `parseFinanceEntry`/`parseRevenueCsv`/`parseExpenseCsv` signatures match their callers. Prisma `pointId_date` compound-unique name matches `@@unique([pointId, date])`. `toDbDate` reused from existing `src/lib/db/dates.ts`.

**Known follow-ups for 4b:** dashboard aggregation + UI, `/`→dashboard + list→`/sheets`, brand mint styling + logo asset, per-point/month filters.

# Вкладка «ФОТ» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development или superpowers:executing-plans. Шаги — чекбоксы `- [ ]`.

**Goal:** Табель смен (Пекарня/Кондитерка) по месяцам с авто-расчётом ЗП (база + премия от выручки дня) и учётом месячного ФОТ в расходах/прибыли дашборда.

**Architecture:** Чистое ядро `src/lib/fot/` (премии/график/ЗП — тестируется без БД). Репозиторий `fot-repo.ts` собирает табель (авто-график ⊕ ручные override). Дашборд вбрасывает месячный ФОТ синтетической строкой расхода `fot` (без правки `aggregateFinance`). UI `/fot` — табель-матрица с кликабельными ячейками.

**Tech Stack:** Next.js 16, Prisma 7 (driver adapter, DDL на `DATABASE_URL_UNPOOLED`), Vitest, TS, Neon, tsx.

**Spec:** `docs/superpowers/specs/2026-06-08-bakery-ops-fot-payroll-design.md`

---

## Файловая структура

| Файл | Ответственность |
|------|-----------------|
| `prisma/schema.prisma` (mod) | enums `EmployeeGroup`/`EmployeeRole`, модели `Employee`, `Attendance` |
| `scripts/seed-employees.mts` (new) | сид ростера 10 человек |
| `src/lib/fot/bonus.ts` (+test) | шкалы премий пекарь/кассир |
| `src/lib/fot/schedule.ts` (+test) | авто-график 2/2 (бригады, кондитеры, кухня) |
| `src/lib/fot/payroll.ts` (+test) | `dailyPay` по роли + премия |
| `src/lib/db/fot-repo.ts` (+test на `buildFot`) | `buildFot` (чистая), `loadFot`, `computePayrollTotal`, `setAttendance` |
| `src/lib/db/dashboard-repo.ts` (mod) | вброс месячного ФОТ в расходы (cur + prev) |
| `src/app/api/fot/attendance/route.ts` (new) | toggle override |
| `src/app/fot/page.tsx`, `src/app/fot/FotGrid.tsx` (new) | страница + табель-сетка |
| `src/app/AppShell.tsx` (mod) | пункт «ФОТ» |

---

## Task 1: Схема (Employee + Attendance)

**Files:** Modify `prisma/schema.prisma`

- [ ] **Step 1:** Добавить в конец `prisma/schema.prisma`:
```prisma
enum EmployeeGroup {
  bakery
  confectionery
}

enum EmployeeRole {
  baker
  cashier
  kitchen
  confectioner
}

model Employee {
  id          String        @id @default(cuid())
  name        String
  group       EmployeeGroup
  role        EmployeeRole
  brigade     String?
  basePay     Decimal       @db.Decimal(10, 2)
  schedOffset Int           @default(0)
  active      Boolean       @default(true)
  createdAt   DateTime      @default(now())
  attendance  Attendance[]

  @@unique([name, group])
}

model Attendance {
  id         String   @id @default(cuid())
  employeeId String
  employee   Employee @relation(fields: [employeeId], references: [id])
  date       DateTime @db.Date
  present    Boolean
  createdAt  DateTime @default(now())
  updatedAt  DateTime @updatedAt

  @@unique([employeeId, date])
  @@index([date])
}
```

- [ ] **Step 2:** Применить и сгенерировать.
Run: `cd /Users/nkola/bakery-ops && set -a && . ./.env && set +a && DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma db push --accept-data-loss && npx prisma generate`
Expected: `Your database is now in sync` + `Generated Prisma Client`.

- [ ] **Step 3:** Commit `git add prisma/schema.prisma && git commit -m "feat(db): Employee + Attendance (ФОТ)"`

---

## Task 2: Сид ростера

**Files:** Create `scripts/seed-employees.mts`

- [ ] **Step 1:** Создать `scripts/seed-employees.mts`:
```ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });

const ROSTER = [
  { name: 'Катя', group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300, schedOffset: 0 },
  { name: 'Евгения', group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300, schedOffset: 0 },
  { name: 'Наташа', group: 'bakery', role: 'cashier', brigade: 'A', basePay: 2100, schedOffset: 0 },
  { name: 'Алёна', group: 'bakery', role: 'baker', brigade: 'B', basePay: 2300, schedOffset: 0 },
  { name: 'Валентина', group: 'bakery', role: 'baker', brigade: 'B', basePay: 2300, schedOffset: 0 },
  { name: 'Кристина', group: 'bakery', role: 'cashier', brigade: 'B', basePay: 2100, schedOffset: 0 },
  { name: 'Людмила', group: 'bakery', role: 'kitchen', brigade: null, basePay: 1500, schedOffset: 0 },
  { name: 'Лена', group: 'confectionery', role: 'confectioner', brigade: null, basePay: 2500, schedOffset: 0 },
  { name: 'Оксана', group: 'confectionery', role: 'confectioner', brigade: null, basePay: 2500, schedOffset: 1 },
  { name: 'Лариса', group: 'confectionery', role: 'confectioner', brigade: null, basePay: 2500, schedOffset: 2 },
] as const;

for (const e of ROSTER) {
  await prisma.employee.upsert({
    where: { name_group: { name: e.name, group: e.group } },
    create: { ...e },
    update: { role: e.role, brigade: e.brigade, basePay: e.basePay, schedOffset: e.schedOffset, active: true },
  });
}
console.log('employees:', await prisma.employee.count());
await prisma.$disconnect();
```

- [ ] **Step 2:** Запустить.
Run: `cd /Users/nkola/bakery-ops && set -a && . ./.env && set +a && npx tsx scripts/seed-employees.mts 2>&1 | grep -v -iE 'sslmode|libpq|warning|prepare for'`
Expected: `employees: 10`.

- [ ] **Step 3:** Commit `git add scripts/seed-employees.mts && git commit -m "feat(fot): сид ростера 10 сотрудников"`

---

## Task 3: Премии (bonus.ts, TDD)

**Files:** Create `src/lib/fot/bonus.test.ts`, `src/lib/fot/bonus.ts`

- [ ] **Step 1: Падающий тест** `src/lib/fot/bonus.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { bakerBonus, cashierBonus } from './bonus';

describe('bakerBonus (от пироги+прочее)', () => {
  it('ступеньки', () => {
    expect(bakerBonus(21999)).toBe(0);
    expect(bakerBonus(22000)).toBe(100);
    expect(bakerBonus(23000)).toBe(300);
    expect(bakerBonus(25999)).toBe(300);
    expect(bakerBonus(26000)).toBe(500);
    expect(bakerBonus(31000)).toBe(800);
    expect(bakerBonus(36000)).toBe(1000);
    expect(bakerBonus(42000)).toBe(1200);
    expect(bakerBonus(99000)).toBe(1200);
  });
});

describe('cashierBonus (общая выручка; нижняя 100 от пирогов)', () => {
  it('ступеньки по общей', () => {
    expect(cashierBonus(51000, 0)).toBe(300);
    expect(cashierBonus(55999, 0)).toBe(300);
    expect(cashierBonus(56000, 0)).toBe(500);
    expect(cashierBonus(61000, 0)).toBe(800);
    expect(cashierBonus(66000, 0)).toBe(1000);
    expect(cashierBonus(71000, 0)).toBe(1200);
  });
  it('нижняя 100 если общая < 51к, но пироги ≥ 22к', () => {
    expect(cashierBonus(40000, 22000)).toBe(100);
    expect(cashierBonus(40000, 21999)).toBe(0);
    expect(cashierBonus(50000, 30000)).toBe(100);
  });
});
```

- [ ] **Step 2:** `cd /Users/nkola/bakery-ops && npx vitest run src/lib/fot/bonus.test.ts` → FAIL.

- [ ] **Step 3: Реализация** `src/lib/fot/bonus.ts`:
```ts
const BAKER: ReadonlyArray<readonly [number, number]> = [
  [42000, 1200], [36000, 1000], [31000, 800], [26000, 500], [23000, 300], [22000, 100],
];
const CASHIER_TOTAL: ReadonlyArray<readonly [number, number]> = [
  [71000, 1200], [66000, 1000], [61000, 800], [56000, 500], [51000, 300],
];

/** Премия пекаря от выручки «пироги+прочее» за день. */
export function bakerBonus(pies: number): number {
  for (const [th, b] of BAKER) if (pies >= th) return b;
  return 0;
}

/** Премия кассира: ступени от общей выручки; нижняя 100, если пироги+прочее ≥ 22к. */
export function cashierBonus(total: number, pies: number): number {
  for (const [th, b] of CASHIER_TOTAL) if (total >= th) return b;
  return pies >= 22000 ? 100 : 0;
}
```

- [ ] **Step 4:** `npx vitest run src/lib/fot/bonus.test.ts` → PASS.
- [ ] **Step 5:** Commit `git add src/lib/fot/bonus.* && git commit -m "feat(fot): шкалы премий пекарь/кассир (TDD)"`

---

## Task 4: Авто-график (schedule.ts, TDD)

**Files:** Create `src/lib/fot/schedule.test.ts`, `src/lib/fot/schedule.ts`

- [ ] **Step 1: Падающий тест** `src/lib/fot/schedule.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { autoPresent, type SchedEmployee } from './schedule';

const baker = (brigade: 'A' | 'B'): SchedEmployee => ({ role: 'baker', group: 'bakery', brigade, schedOffset: 0 });
const conf = (schedOffset: number): SchedEmployee => ({ role: 'confectioner', group: 'confectionery', brigade: null, schedOffset });
const kitchen: SchedEmployee = { role: 'kitchen', group: 'bakery', brigade: null, schedOffset: 0 };

describe('autoPresent', () => {
  it('бригады A/B 2/2 от опоры 08.06', () => {
    expect([8, 9, 10, 11, 12, 13].map((d) => autoPresent(baker('A'), `2026-06-${d}`))).toEqual([true, true, false, false, true, true]);
    expect([8, 9, 10, 11, 12, 13].map((d) => autoPresent(baker('B'), `2026-06-${d}`))).toEqual([false, false, true, true, false, false]);
  });
  it('кондитеры со сдвигом', () => {
    expect([8, 9, 10, 11].map((d) => autoPresent(conf(0), `2026-06-${d}`))).toEqual([true, true, false, false]); // Лена
    expect([8, 9, 10, 11].map((d) => autoPresent(conf(1), `2026-06-${d}`))).toEqual([false, true, true, false]); // Оксана
    expect([8, 9, 10, 11].map((d) => autoPresent(conf(2), `2026-06-${d}`))).toEqual([false, false, true, true]); // Лариса
  });
  it('кухня Пн–Пт', () => {
    expect(autoPresent(kitchen, '2026-06-08')).toBe(true); // Пн
    expect(autoPresent(kitchen, '2026-06-13')).toBe(false); // Сб
    expect(autoPresent(kitchen, '2026-06-14')).toBe(false); // Вс
  });
});
```
> Прим.: даты в тесте без ведущего нуля (`2026-06-8`) валидны для `new Date`/Date.UTC при ручном парсе; в `schedule.ts` парсим числа из строки, поэтому и `2026-06-8`, и `2026-06-08` дают один результат.

- [ ] **Step 2:** `npx vitest run src/lib/fot/schedule.test.ts` → FAIL.

- [ ] **Step 3: Реализация** `src/lib/fot/schedule.ts`:
```ts
export type SchedEmployee = {
  role: 'baker' | 'cashier' | 'kitchen' | 'confectioner';
  group: 'bakery' | 'confectionery';
  brigade: string | null;
  schedOffset: number;
};

export const ANCHOR = '2026-06-08';

const toUTC = (iso: string): number => {
  const [y, m, d] = iso.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
};
const mod = (n: number, m: number) => ((n % m) + m) % m;
const daysFromAnchor = (iso: string): number => Math.round((toUTC(iso) - toUTC(ANCHOR)) / 86400000);

/** Плановый выход сотрудника на дату (без учёта ручных правок). */
export function autoPresent(emp: SchedEmployee, iso: string): boolean {
  if (emp.role === 'kitchen') {
    const wd = new Date(toUTC(iso)).getUTCDay();
    return wd >= 1 && wd <= 5;
  }
  if (emp.group === 'confectionery') {
    return mod(daysFromAnchor(iso) - emp.schedOffset, 4) <= 1;
  }
  // пекарня: бригады A/B, 2/2
  const cyclePos = mod(Math.floor(daysFromAnchor(iso) / 2), 2); // 0 → A, 1 → B
  return (emp.brigade === 'A' && cyclePos === 0) || (emp.brigade === 'B' && cyclePos === 1);
}
```

- [ ] **Step 4:** `npx vitest run src/lib/fot/schedule.test.ts` → PASS.
- [ ] **Step 5:** Commit `git add src/lib/fot/schedule.* && git commit -m "feat(fot): авто-график 2/2 (бригады/кондитеры/кухня, TDD)"`

---

## Task 5: Расчёт ЗП за смену (payroll.ts, TDD)

**Files:** Create `src/lib/fot/payroll.test.ts`, `src/lib/fot/payroll.ts`

- [ ] **Step 1: Падающий тест** `src/lib/fot/payroll.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { dailyPay, type PayEmployee } from './payroll';

const emp = (role: PayEmployee['role'], basePay: number): PayEmployee => ({ role, basePay });

describe('dailyPay', () => {
  it('пекарь = база + премия по пирогам', () => {
    expect(dailyPay(emp('baker', 2300), { total: 60000, pies: 31000 })).toBe(2300 + 800);
  });
  it('кассир = база + премия по общей', () => {
    expect(dailyPay(emp('cashier', 2100), { total: 56000, pies: 40000 })).toBe(2100 + 500);
  });
  it('кондитер и кухня — без премии', () => {
    expect(dailyPay(emp('confectioner', 2500), { total: 99000, pies: 99000 })).toBe(2500);
    expect(dailyPay(emp('kitchen', 1500), { total: 99000, pies: 99000 })).toBe(1500);
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/fot/payroll.test.ts` → FAIL.

- [ ] **Step 3: Реализация** `src/lib/fot/payroll.ts`:
```ts
import { bakerBonus, cashierBonus } from './bonus';

export type PayEmployee = { role: 'baker' | 'cashier' | 'kitchen' | 'confectioner'; basePay: number };
export type DayRevenue = { total: number; pies: number };

/** ЗП за одну смену: база по роли + премия (пекарь/кассир). */
export function dailyPay(emp: PayEmployee, rev: DayRevenue): number {
  if (emp.role === 'baker') return emp.basePay + bakerBonus(rev.pies);
  if (emp.role === 'cashier') return emp.basePay + cashierBonus(rev.total, rev.pies);
  return emp.basePay;
}
```

- [ ] **Step 4:** `npx vitest run src/lib/fot/payroll.test.ts` → PASS.
- [ ] **Step 5:** Commit `git add src/lib/fot/payroll.* && git commit -m "feat(fot): расчёт ЗП за смену (TDD)"`

---

## Task 6: Сборка табеля (fot-repo.ts)

**Files:** Create `src/lib/db/fot-repo.test.ts`, `src/lib/db/fot-repo.ts`

- [ ] **Step 1: Падающий тест** (на чистую `buildFot`) `src/lib/db/fot-repo.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { buildFot, type FotEmployee } from './fot-repo';

const monthDays = ['2026-06-08', '2026-06-09', '2026-06-10'];
const employees: FotEmployee[] = [
  { id: 'k', name: 'Катя', group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300, schedOffset: 0 },
  { id: 'l', name: 'Лена', group: 'confectionery', role: 'confectioner', brigade: null, basePay: 2500, schedOffset: 0 },
];
const revenueByDate = new Map([
  ['2026-06-08', { total: 60000, pies: 31000 }], // пекарь премия 800
  ['2026-06-09', { total: 40000, pies: 20000 }], // премия 0
]);

describe('buildFot', () => {
  it('считает выходы и ЗП, применяет override поверх авто-графика', () => {
    const v = buildFot({ month: '2026-06', monthDays, employees, revenueByDate, overrides: new Map() });
    const katya = v.bakery.find((r) => r.employee.id === 'k')!;
    // 08 W (3100), 09 W (2300), 10 O — бригада A
    expect(katya.days.map((d) => d.present)).toEqual([true, true, false]);
    expect(katya.payTotal).toBe(3100 + 2300);
    const lena = v.confectionery.find((r) => r.employee.id === 'l')!;
    expect(lena.days.map((d) => d.present)).toEqual([true, true, false]); // Лена 08,09 W
    expect(lena.payTotal).toBe(5000);
  });

  it('override снимает смену', () => {
    const v = buildFot({ month: '2026-06', monthDays, employees, revenueByDate, overrides: new Map([['k|2026-06-08', false]]) });
    const katya = v.bakery.find((r) => r.employee.id === 'k')!;
    expect(katya.days[0].present).toBe(false);
    expect(katya.payTotal).toBe(2300); // только 09
  });
});
```

- [ ] **Step 2:** `npx vitest run src/lib/db/fot-repo.test.ts` → FAIL.

- [ ] **Step 3: Реализация** `src/lib/db/fot-repo.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import { monthRange, monthDays as monthDaysOf } from '@/lib/finance/month';
import { toDbDate } from './dates';
import { autoPresent, type SchedEmployee } from '@/lib/fot/schedule';
import { dailyPay } from '@/lib/fot/payroll';

export type FotEmployee = {
  id: string; name: string;
  group: 'bakery' | 'confectionery';
  role: 'baker' | 'cashier' | 'kitchen' | 'confectioner';
  brigade: string | null; basePay: number; schedOffset: number;
};
export type FotDay = { date: string; present: boolean; pay: number };
export type FotRow = { employee: FotEmployee; days: FotDay[]; shifts: number; payTotal: number; payTo15: number; payAfter15: number };
export type FotView = {
  month: string; monthDays: string[];
  bakery: FotRow[]; confectionery: FotRow[];
  dailyTotal: { date: string; amount: number }[];
  totals: { bakeryTo15: number; bakeryAfter15: number; bakeryTotal: number; confectioneryTotal: number; grand: number };
};

/** Чистая сборка табеля из данных (без БД). */
export function buildFot(args: {
  month: string;
  monthDays: string[];
  employees: FotEmployee[];
  revenueByDate: Map<string, { total: number; pies: number }>;
  overrides: Map<string, boolean>;
}): FotView {
  const { month, monthDays, employees, revenueByDate, overrides } = args;
  const rows: FotRow[] = employees.map((e) => {
    const sched: SchedEmployee = { role: e.role, group: e.group, brigade: e.brigade, schedOffset: e.schedOffset };
    let payTotal = 0, payTo15 = 0, payAfter15 = 0, shifts = 0;
    const days: FotDay[] = monthDays.map((date) => {
      const ov = overrides.get(`${e.id}|${date}`);
      const present = ov ?? autoPresent(sched, date);
      const pay = present ? dailyPay({ role: e.role, basePay: e.basePay }, revenueByDate.get(date) ?? { total: 0, pies: 0 }) : 0;
      if (present) {
        shifts++;
        payTotal += pay;
        if (Number(date.slice(8, 10)) <= 15) payTo15 += pay;
        else payAfter15 += pay;
      }
      return { date, present, pay };
    });
    return { employee: e, days, shifts, payTotal, payTo15, payAfter15 };
  });
  const bakery = rows.filter((r) => r.employee.group === 'bakery');
  const confectionery = rows.filter((r) => r.employee.group === 'confectionery');
  const dailyTotal = monthDays.map((date, i) => ({ date, amount: rows.reduce((s, r) => s + r.days[i].pay, 0) }));
  const sumBy = (rs: FotRow[], k: (r: FotRow) => number) => rs.reduce((s, r) => s + k(r), 0);
  const totals = {
    bakeryTo15: sumBy(bakery, (r) => r.payTo15),
    bakeryAfter15: sumBy(bakery, (r) => r.payAfter15),
    bakeryTotal: sumBy(bakery, (r) => r.payTotal),
    confectioneryTotal: sumBy(confectionery, (r) => r.payTotal),
    grand: sumBy(rows, (r) => r.payTotal),
  };
  return { month, monthDays, bakery, confectionery, dailyTotal, totals };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function fetchInputs(prisma: PrismaClient, month: string) {
  const { start, end } = monthRange(month);
  const startD = new Date(`${start}T00:00:00.000Z`);
  const endD = new Date(`${end}T00:00:00.000Z`);
  const [emps, revs, atts] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: [{ group: 'asc' }, { name: 'asc' }] }),
    prisma.revenue.findMany({ where: { pointId: 'point-1', date: { gte: startD, lt: endD } }, select: { date: true, amount: true, confectionery: true } }),
    prisma.attendance.findMany({ where: { date: { gte: startD, lt: endD } }, select: { employeeId: true, date: true, present: true } }),
  ]);
  const employees: FotEmployee[] = emps.map((e) => ({
    id: e.id, name: e.name, group: e.group as FotEmployee['group'], role: e.role as FotEmployee['role'],
    brigade: e.brigade, basePay: Number(e.basePay), schedOffset: e.schedOffset,
  }));
  const revenueByDate = new Map<string, { total: number; pies: number }>();
  for (const r of revs) {
    const total = Number(r.amount);
    revenueByDate.set(iso(r.date), { total, pies: total - (r.confectionery == null ? 0 : Number(r.confectionery)) });
  }
  const overrides = new Map<string, boolean>();
  for (const a of atts) overrides.set(`${a.employeeId}|${iso(a.date)}`, a.present);
  return { employees, revenueByDate, overrides };
}

export async function loadFot(prisma: PrismaClient, month: string): Promise<FotView> {
  const { employees, revenueByDate, overrides } = await fetchInputs(prisma, month);
  return buildFot({ month, monthDays: monthDaysOf(month), employees, revenueByDate, overrides });
}

/** Сумма ФОТ за месяц (для дашборда). */
export async function computePayrollTotal(prisma: PrismaClient, month: string): Promise<number> {
  return (await loadFot(prisma, month)).totals.grand;
}

/** Ручная отметка выхода (override поверх авто-графика). */
export async function setAttendance(prisma: PrismaClient, employeeId: string, date: string, present: boolean) {
  const d = toDbDate(date);
  return prisma.attendance.upsert({
    where: { employeeId_date: { employeeId, date: d } },
    create: { employeeId, date: d, present },
    update: { present },
  });
}
```

- [ ] **Step 4:** `npx vitest run src/lib/db/fot-repo.test.ts` → PASS. Затем `npx tsc --noEmit` → без ошибок.
- [ ] **Step 5:** Commit `git add src/lib/db/fot-repo.* && git commit -m "feat(fot): сборка табеля (buildFot/loadFot/computePayrollTotal/setAttendance)"`

---

## Task 7: Вброс ФОТ в дашборд

**Files:** Modify `src/lib/db/dashboard-repo.ts`

- [ ] **Step 1:** В `dashboard-repo.ts` импортировать репозиторий ФОТ — добавить к существующим импортам строку:
```ts
import { computePayrollTotal } from './fot-repo';
```

- [ ] **Step 2:** В `loadDashboard`, перед вызовом `aggregateFinance`, посчитать ФОТ за текущий и прошлый месяц (ФОТ только Плюшкино → не учитываем для Корицы) и подмешать его в расходы. Найти блок:
```ts
  const finance = aggregateFinance({
    monthDays: monthDays(month),
    revenues: revCur.map((r) => ({ date: iso(r.date), amount: Number(r.amount) })),
    expenses: expCur.map((e) => ({ date: iso(e.date), amount: Number(e.amount), category: e.category })),
    prevRevenue: revPrev.reduce((a, r) => a + Number(r.amount), 0),
    prevExpense: expPrev.reduce((a, e) => a + Number(e.amount), 0),
  });
```
и заменить на:
```ts
  const includeFot = point !== 'point-2'; // ФОТ — Плюшкино
  const fotCur = includeFot ? await computePayrollTotal(prisma, month) : 0;
  const fotPrev = includeFot ? await computePayrollTotal(prisma, prevMonth(month)) : 0;
  const expensesInput = expCur.map((e) => ({ date: iso(e.date), amount: Number(e.amount), category: e.category }));
  if (fotCur > 0) expensesInput.push({ date: start, amount: fotCur, category: 'fot' });
  const finance = aggregateFinance({
    monthDays: monthDays(month),
    revenues: revCur.map((r) => ({ date: iso(r.date), amount: Number(r.amount) })),
    expenses: expensesInput,
    prevRevenue: revPrev.reduce((a, r) => a + Number(r.amount), 0),
    prevExpense: expPrev.reduce((a, e) => a + Number(e.amount), 0) + fotPrev,
  });
```
(`prevMonth` уже импортирован в файле; `start` — из `monthRange(month)`, уже есть в области видимости.)

- [ ] **Step 3:** Проверка типов и существующих тестов.
Run: `cd /Users/nkola/bakery-ops && npx tsc --noEmit && npx vitest run src/lib/finance src/lib/db` → без ошибок.

- [ ] **Step 4:** Commit `git add src/lib/db/dashboard-repo.ts && git commit -m "feat(dashboard): месячный ФОТ в расходах/прибыли (category fot)"`

---

## Task 8: API toggle отметки

**Files:** Create `src/app/api/fot/attendance/route.ts`

- [ ] **Step 1:** Создать `src/app/api/fot/attendance/route.ts`:
```ts
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { setAttendance } from '@/lib/db/fot-repo';

export const runtime = 'nodejs';

const ISO = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
  const body = await req.json().catch(() => ({}));
  const employeeId = String(body.employeeId ?? '');
  const date = String(body.date ?? '');
  const present = Boolean(body.present);
  if (!employeeId || !ISO.test(date)) return Response.json({ error: 'employeeId и date обязательны' }, { status: 400 });
  await setAttendance(getPrisma(), employeeId, date, present);
  return Response.json({ ok: true });
}
```

- [ ] **Step 2:** `npx tsc --noEmit` → без ошибок.
- [ ] **Step 3:** Commit `git add src/app/api/fot && git commit -m "feat(fot): API toggle отметки выхода"`

---

## Task 9: Страница /fot + сетка + навигация

**Files:** Create `src/app/fot/page.tsx`, `src/app/fot/FotGrid.tsx`; Modify `src/app/AppShell.tsx`

- [ ] **Step 1:** `src/app/fot/FotGrid.tsx` (клиент):
```tsx
'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import type { FotRow } from '@/lib/db/fot-repo';

const rub = (n: number) => Math.round(n).toLocaleString('ru-RU');

export function FotGrid({ rows, monthDays, semiMonthly }: { rows: FotRow[]; monthDays: string[]; semiMonthly: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function toggle(employeeId: string, date: string, present: boolean) {
    if (busy) return;
    setBusy(true);
    await fetch('/api/fot/attendance', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ employeeId, date, present: !present }) });
    setBusy(false);
    router.refresh();
  }

  const cell: React.CSSProperties = { width: 26, minWidth: 26, textAlign: 'center', padding: '4px 0', borderLeft: '1px solid var(--line)', cursor: 'pointer', userSelect: 'none', fontSize: 12 };
  const head: React.CSSProperties = { fontSize: 10.5, color: 'var(--muted)', fontWeight: 700, padding: '0 0 6px' };
  const numTd: React.CSSProperties = { padding: '4px 8px', textAlign: 'right', fontWeight: 800, fontVariantNumeric: 'tabular-nums', borderLeft: '1px solid var(--line)', whiteSpace: 'nowrap' };

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ borderCollapse: 'collapse', width: '100%' }}>
        <thead>
          <tr>
            <th style={{ ...head, textAlign: 'left', position: 'sticky', left: 0, background: 'var(--card)', minWidth: 150 }}>Сотрудник</th>
            {monthDays.map((d) => (
              <th key={d} style={{ ...head, width: 26 }}>{Number(d.slice(8, 10))}</th>
            ))}
            <th style={{ ...head, textAlign: 'right', paddingLeft: 8 }}>Смен</th>
            {semiMonthly ? (
              <>
                <th style={{ ...head, textAlign: 'right', paddingLeft: 8 }}>к 15</th>
                <th style={{ ...head, textAlign: 'right', paddingLeft: 8 }}>2-я пол.</th>
                <th style={{ ...head, textAlign: 'right', paddingLeft: 8 }}>За месяц</th>
              </>
            ) : (
              <th style={{ ...head, textAlign: 'right', paddingLeft: 8 }}>За месяц</th>
            )}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.employee.id} style={{ borderTop: '1px solid var(--line)' }}>
              <td style={{ padding: '6px 8px 6px 0', position: 'sticky', left: 0, background: 'var(--card)', whiteSpace: 'nowrap' }}>
                <span style={{ fontWeight: 700, color: 'var(--ink)' }}>{r.employee.name}</span>
                <span style={{ color: 'var(--muted)', fontSize: 11, marginLeft: 6 }}>
                  {r.employee.role === 'baker' ? `пекарь ${r.employee.brigade ?? ''}` : r.employee.role === 'cashier' ? `кассир ${r.employee.brigade ?? ''}` : r.employee.role === 'kitchen' ? 'кухня' : 'кондитер'}
                </span>
              </td>
              {r.days.map((d) => (
                <td key={d.date} style={{ ...cell, background: d.present ? 'rgba(46,125,91,0.12)' : 'transparent', color: d.present ? 'var(--profit)' : 'var(--muted)' }}
                  title={`${d.date} · ${d.present ? rub(d.pay) + ' ₽' : 'выходной'}`}
                  onClick={() => toggle(r.employee.id, d.date, d.present)}>
                  {d.present ? '✓' : ''}
                </td>
              ))}
              <td style={{ ...numTd, color: 'var(--ink)' }}>{r.shifts}</td>
              {semiMonthly ? (
                <>
                  <td style={{ ...numTd, color: 'var(--ink)' }}>{rub(r.payTo15)}</td>
                  <td style={{ ...numTd, color: 'var(--ink)' }}>{rub(r.payAfter15)}</td>
                  <td style={{ ...numTd, color: 'var(--profit)' }}>{rub(r.payTotal)}</td>
                </>
              ) : (
                <td style={{ ...numTd, color: 'var(--profit)' }}>{rub(r.payTotal)}</td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
```

- [ ] **Step 2:** `src/app/fot/page.tsx` (сервер):
```tsx
import Link from 'next/link';
import { getPrisma } from '@/lib/db/client';
import { loadFot } from '@/lib/db/fot-repo';
import { currentMonth, monthLabel, prevMonth, nextMonth } from '@/lib/finance/month';
import { FotGrid } from './FotGrid';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const rub = (n: number) => '₽ ' + Math.round(n).toLocaleString('ru-RU');
const card: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 'var(--radius)', boxShadow: 'var(--shadow)', padding: 22, marginBottom: 18 };

export default async function FotPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const sp = await searchParams;
  const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month ?? '') ? (sp.month as string) : currentMonth(new Date());
  const v = await loadFot(getPrisma(), month);
  const q = (m: string) => `/fot?month=${m}`;
  const t = v.totals;

  return (
    <div style={{ padding: '24px 28px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18, flexWrap: 'wrap', gap: 14 }}>
        <h1 style={{ fontSize: 28, fontWeight: 800, letterSpacing: '-0.03em', color: 'var(--ink)' }}>ФОТ</h1>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--card)', padding: '6px 8px', borderRadius: 12, border: '1px solid var(--line)' }}>
          <Link href={q(prevMonth(month))} style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 17 }}>‹</Link>
          <span style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--ink)', minWidth: 110, textAlign: 'center' }}>{monthLabel(month)}</span>
          <Link href={q(nextMonth(month))} style={{ width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 17 }}>›</Link>
        </div>
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Пекарня</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>к 15-му: <b style={{ color: 'var(--ink)' }}>{rub(t.bakeryTo15)}</b> · 2-я половина: <b style={{ color: 'var(--ink)' }}>{rub(t.bakeryAfter15)}</b> · за месяц: <b style={{ color: 'var(--profit)' }}>{rub(t.bakeryTotal)}</b></div>
        </div>
        <FotGrid rows={v.bakery} monthDays={v.monthDays} semiMonthly />
      </div>

      <div style={card}>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 12, gap: 12, flexWrap: 'wrap' }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>Кондитерка</div>
          <div style={{ fontSize: 13, color: 'var(--muted)', fontWeight: 600 }}>за месяц: <b style={{ color: 'var(--profit)' }}>{rub(t.confectioneryTotal)}</b></div>
        </div>
        <FotGrid rows={v.confectionery} monthDays={v.monthDays} semiMonthly={false} />
      </div>

      <p style={{ fontSize: 12.5, color: 'var(--muted)', fontWeight: 600 }}>Итого ФОТ за месяц: <b style={{ color: 'var(--ink)' }}>{rub(t.grand)}</b>. Клик по ячейке — переключить выход. Премии считаются от выручки Плюшкино за день.</p>
    </div>
  );
}
```

- [ ] **Step 3:** В `src/app/AppShell.tsx` добавить пункт «ФОТ» в массив `NAV` после «Разбивки»:
```tsx
  { href: '/fot', label: 'ФОТ', icon: I(<><circle cx="9" cy="8" r="3" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0M16 11h5M16 15h5M16 7h5" strokeLinecap="round" /></>) },
```

- [ ] **Step 4:** Сборка.
Run: `cd /Users/nkola/bakery-ops && npx tsc --noEmit && npx eslint src && npm run build 2>&1 | grep -E 'Compiled|error|/fot'`
Expected: tsc/eslint без ошибок; build `✓ Compiled`; маршрут `/fot` в списке.

- [ ] **Step 5:** Commit `git add src/app/fot src/app/AppShell.tsx && git commit -m "feat(fot): страница ФОТ (табель-матрица) + навигация"`

---

## Финальная проверка
- [ ] `cd /Users/nkola/bakery-ops && npx tsc --noEmit && npx eslint src && npm test && npm run build` → всё зелёное.
- [ ] Деплой: `npx vercel deploy --prod --yes` (нужен из-за новых таблиц/enum и категории `fot` в расходах). Схема уже на Neon (Task 1), ростер засеян (Task 2).
- [ ] Проверить вживую: открыть `/fot` за текущий месяц — две секции, ✓ по авто-графику, клик переключает; на дашборде в «Структуре расходов» появился сегмент «ФОТ», прибыль уменьшилась на сумму ФОТ.

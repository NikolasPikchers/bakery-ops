# Bakery Ops — Phase 1, Plan 1: Foundation (доменное ядро + схема БД)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Поднять каркас Next.js-проекта и реализовать (через TDD) доменное ядро Фазы 1 — чистые функции парсинга бумажных ячеек и расчётов (продано, возраст остатка), схему БД и типизированный сид каталога.

**Architecture:** Чистые, не зависящие от БД/UI модули в `src/lib/domain/*` (парсинг + математика учёта) — самый рискованный по корректности код, полностью покрытый юнит-тестами на реальных кейсах с фото. Схема Prisma описывает модель данных из спеки. Каталог SKU — типизированные данные + валидация. Распознавание, бот и дашборд — отдельные планы (2–4), которые опираются на это ядро.

**Tech Stack:** Next.js 15 (App Router, TypeScript, src-dir), Vitest (юнит-тесты), Prisma + PostgreSQL (схема; миграции — в плане данных), npm.

**Покрытие спеки этим планом:** §1 (семантика ячеек: парсинг), §5 (модель данных: Prisma-схема), §8 (формула «продано»), §9 (формула aging). Не входит (планы 2–4): §6 распознавание, §7 поток захвата/подтверждения, §10 дашборд, §11 auth.

---

### Task 1: Каркас проекта (Next.js + Vitest)

Репозиторий `~/bakery-ops` уже существует (есть `.git` и `docs/`), поэтому `create-next-app` ставим во временную папку и переносим файлы в корень.

**Files:**
- Create: весь каркас Next.js в корне репозитория
- Create: `vitest.config.ts`
- Modify: `package.json` (скрипты тестов)

- [ ] **Step 1: Сгенерировать каркас Next.js во временную папку и перенести в корень**

```bash
cd ~/bakery-ops
npx --yes create-next-app@latest _scaffold \
  --ts --app --eslint --no-tailwind --src-dir --import-alias "@/*" --use-npm
rm -rf _scaffold/.git _scaffold/README.md
shopt -s dotglob
mv _scaffold/* ./
shopt -u dotglob
rmdir _scaffold
```

- [ ] **Step 2: Проверить, что каркас на месте**

Run: `cd ~/bakery-ops && test -f package.json && test -d src/app && echo OK`
Expected: выводит `OK`

- [ ] **Step 3: Установить Vitest**

```bash
cd ~/bakery-ops
npm install -D vitest @vitest/coverage-v8
```

- [ ] **Step 4: Создать конфиг Vitest**

Create `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: { provider: 'v8' },
  },
});
```

- [ ] **Step 5: Добавить тест-скрипты в package.json**

В `package.json` в раздел `"scripts"` добавить:

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 6: Создать дымовой тест и убедиться, что раннер работает**

Create `src/lib/domain/smoke.test.ts`:

```ts
import { describe, it, expect } from 'vitest';

describe('smoke', () => {
  it('runs', () => {
    expect(1 + 1).toBe(2);
  });
});
```

Run: `cd ~/bakery-ops && npm test`
Expected: PASS (1 passed)

- [ ] **Step 7: Удалить дымовой тест и закоммитить**

```bash
cd ~/bakery-ops
rm src/lib/domain/smoke.test.ts
git add -A
git commit -m "chore: scaffold Next.js app + Vitest"
```

---

### Task 2: Доменные типы

**Files:**
- Create: `src/lib/domain/types.ts`

- [ ] **Step 1: Описать общие типы доменного ядра**

Create `src/lib/domain/types.ts`:

```ts
/** Результат разбора одной рукописной ячейки количества. */
export type ParsedQuantity = {
  /** Итоговое числовое значение; null = ячейка не заполнена. */
  value: number | null;
  /** Исходный текст ячейки (никогда не теряем). */
  raw: string;
  /** Найденные числовые операнды, напр. [24, 12, 6]. */
  parts: number[];
  /** true, если требуется ручная проверка (мусор, единицы, несходящийся «=итог»). */
  ambiguous: boolean;
};

/** Тип листа (печатные шаблоны и свободная рукопись). */
export type SheetType = 'pies' | 'desserts' | 'confectionery_freeform';

/** На каких точках встречается позиция. */
export type PointScope = 'both' | 'point1' | 'point2';
```

- [ ] **Step 2: Закоммитить**

```bash
cd ~/bakery-ops
git add src/lib/domain/types.ts
git commit -m "feat(domain): shared domain types"
```

---

### Task 3: `parseQuantity` — разбор ячеек

Парсит реальные форматы с листов: партии `a+b+c`, поправки `x-y`, итог `=N`, кружок ⑨, прочерк/пустое, единицы (кг/десерт) → флаг `ambiguous`.

**Files:**
- Create: `src/lib/domain/parseQuantity.ts`
- Test: `src/lib/domain/parseQuantity.test.ts`

- [ ] **Step 1: Написать падающий тест**

Create `src/lib/domain/parseQuantity.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { parseQuantity } from './parseQuantity';

describe('parseQuantity', () => {
  it('пустое и прочерк → null, не ambiguous', () => {
    expect(parseQuantity('')).toMatchObject({ value: null, ambiguous: false });
    expect(parseQuantity('   ')).toMatchObject({ value: null, ambiguous: false });
    expect(parseQuantity('-')).toMatchObject({ value: null, ambiguous: false });
    expect(parseQuantity('—')).toMatchObject({ value: null, ambiguous: false });
  });

  it('одиночное число', () => {
    expect(parseQuantity('9')).toMatchObject({ value: 9, parts: [9], ambiguous: false });
  });

  it('партии прихода a+b+c → сумма', () => {
    expect(parseQuantity('8+8')).toMatchObject({ value: 16, parts: [8, 8], ambiguous: false });
    expect(parseQuantity('24+12+6')).toMatchObject({ value: 42, parts: [24, 12, 6], ambiguous: false });
    expect(parseQuantity('24+10')).toMatchObject({ value: 34, ambiguous: false });
  });

  it('поправка остатка x-y → разность', () => {
    expect(parseQuantity('13-1')).toMatchObject({ value: 12, parts: [13, 1], ambiguous: false });
    expect(parseQuantity('5-1')).toMatchObject({ value: 4, ambiguous: false });
  });

  it('явный итог =N: доверяем итогу, math сходится → не ambiguous', () => {
    expect(parseQuantity('2+1=3')).toMatchObject({ value: 3, parts: [2, 1], ambiguous: false });
    expect(parseQuantity('8+25=33')).toMatchObject({ value: 33, ambiguous: false });
  });

  it('явный итог =N не сходится с суммой → ambiguous, берём написанный итог', () => {
    expect(parseQuantity('2+1=4')).toMatchObject({ value: 4, ambiguous: true });
  });

  it('кружок-итог ⑨: math сходится', () => {
    expect(parseQuantity('6+3 ⑨')).toMatchObject({ value: 9, parts: [6, 3], ambiguous: false });
  });

  it('единицы/мусор → ambiguous, лучшее усилие по числу', () => {
    expect(parseQuantity('3кг')).toMatchObject({ value: 3, ambiguous: true });
    expect(parseQuantity('1десерт')).toMatchObject({ value: 1, ambiguous: true });
  });

  it('всегда сохраняет raw', () => {
    expect(parseQuantity('24+12+6').raw).toBe('24+12+6');
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd ~/bakery-ops && npx vitest run src/lib/domain/parseQuantity.test.ts`
Expected: FAIL (Cannot find module './parseQuantity')

- [ ] **Step 3: Реализовать `parseQuantity`**

Create `src/lib/domain/parseQuantity.ts`:

```ts
import type { ParsedQuantity } from './types';

const CIRCLED: Record<string, number> = {
  '①': 1, '②': 2, '③': 3, '④': 4, '⑤': 5, '⑥': 6, '⑦': 7, '⑧': 8, '⑨': 9, '⑩': 10,
  '⑪': 11, '⑫': 12, '⑬': 13, '⑭': 14, '⑮': 15, '⑯': 16, '⑰': 17, '⑱': 18, '⑲': 19, '⑳': 20,
};

export function parseQuantity(input: string): ParsedQuantity {
  const raw = input ?? '';
  const trimmed = raw.trim();

  // пустое / прочерк (минус, en-dash, em-dash)
  if (trimmed === '' || /^[-–—]+$/.test(trimmed)) {
    return { value: null, raw, parts: [], ambiguous: false };
  }

  // нормализуем тире в минус, схлопываем пробелы
  let s = trimmed.replace(/[–—]/g, '-').replace(/\s+/g, ' ');

  // вынимаем кружок-итог, если есть, и убираем его из строки
  let circled: number | null = null;
  for (const ch of s) {
    if (CIRCLED[ch] != null) circled = CIRCLED[ch];
  }
  s = [...s].filter((ch) => CIRCLED[ch] == null).join('').trim();

  // вынимаем явный «=N»
  let stated: number | null = null;
  const eq = s.match(/=\s*(\d+)\s*$/);
  if (eq) {
    stated = parseInt(eq[1], 10);
    s = s.slice(0, eq.index).trim();
  }

  // строка должна быть арифметикой из чисел и +/-
  const isPureExpr = /^\d+(\s*[+\-]\s*\d+)*$/.test(s);
  if (!isPureExpr) {
    const nums = (s.match(/\d+/g) ?? []).map((n) => parseInt(n, 10));
    const value = stated ?? circled ?? (nums.length ? nums[0] : null);
    return { value, raw, parts: nums, ambiguous: true };
  }

  const tokens = s.match(/\d+|[+\-]/g)!;
  let acc = parseInt(tokens[0], 10);
  const parts = [acc];
  for (let i = 1; i < tokens.length; i += 2) {
    const op = tokens[i];
    const n = parseInt(tokens[i + 1], 10);
    parts.push(n);
    acc = op === '+' ? acc + n : acc - n;
  }

  const explicit = stated ?? circled;
  if (explicit != null) {
    return { value: explicit, raw, parts, ambiguous: explicit !== acc };
  }
  return { value: acc, raw, parts, ambiguous: false };
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `cd ~/bakery-ops && npx vitest run src/lib/domain/parseQuantity.test.ts`
Expected: PASS (все кейсы)

- [ ] **Step 5: Закоммитить**

```bash
cd ~/bakery-ops
git add src/lib/domain/parseQuantity.ts src/lib/domain/parseQuantity.test.ts
git commit -m "feat(domain): parseQuantity — разбор рукописных ячеек количества"
```

---

### Task 4: `computeSold` — расчёт продаж

Формула из спеки §8: `Продано = вчер.остаток + приход − списание − остаток`. Нет базы (нет вчерашнего остатка) → null. Отрицательное → флаг аномалии.

**Files:**
- Create: `src/lib/domain/computeSold.ts`
- Test: `src/lib/domain/computeSold.test.ts`

- [ ] **Step 1: Написать падающий тест**

Create `src/lib/domain/computeSold.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeSold } from './computeSold';

describe('computeSold', () => {
  it('реальный кейс с листа (Самса 6.06): 3 + 8 − 0 − 9 = 2', () => {
    expect(computeSold({ prevOstatok: 3, prihod: 8, spisanie: 0, ostatok: 9 }))
      .toMatchObject({ sold: 2 });
  });

  it('нет вчерашнего остатка → null с reason no-base', () => {
    expect(computeSold({ prevOstatok: null, prihod: 8, spisanie: 0, ostatok: 3 }))
      .toMatchObject({ sold: null, reason: 'no-base' });
  });

  it('нет сегодняшнего остатка → null с reason no-base', () => {
    expect(computeSold({ prevOstatok: 3, prihod: 8, spisanie: 0, ostatok: null }))
      .toMatchObject({ sold: null, reason: 'no-base' });
  });

  it('null приход/списание трактуются как 0', () => {
    expect(computeSold({ prevOstatok: 5, prihod: null, spisanie: null, ostatok: 2 }))
      .toMatchObject({ sold: 3 });
  });

  it('учитывает списание', () => {
    expect(computeSold({ prevOstatok: 0, prihod: 15, spisanie: 3, ostatok: 9 }))
      .toMatchObject({ sold: 3 });
  });

  it('отрицательное продано → anomaly', () => {
    expect(computeSold({ prevOstatok: 1, prihod: 0, spisanie: 0, ostatok: 5 }))
      .toMatchObject({ sold: -4, anomaly: true });
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd ~/bakery-ops && npx vitest run src/lib/domain/computeSold.test.ts`
Expected: FAIL (Cannot find module './computeSold')

- [ ] **Step 3: Реализовать `computeSold`**

Create `src/lib/domain/computeSold.ts`:

```ts
export type SoldResult = {
  sold: number | null;
  reason?: 'no-base';
  anomaly?: boolean;
};

export function computeSold(args: {
  prevOstatok: number | null;
  prihod: number | null;
  spisanie: number | null;
  ostatok: number | null;
}): SoldResult {
  const { prevOstatok, prihod, spisanie, ostatok } = args;
  if (prevOstatok == null || ostatok == null) {
    return { sold: null, reason: 'no-base' };
  }
  const sold = prevOstatok + (prihod ?? 0) - (spisanie ?? 0) - ostatok;
  if (sold < 0) return { sold, anomaly: true };
  return { sold };
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `cd ~/bakery-ops && npx vitest run src/lib/domain/computeSold.test.ts`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
cd ~/bakery-ops
git add src/lib/domain/computeSold.ts src/lib/domain/computeSold.test.ts
git commit -m "feat(domain): computeSold — расчёт продаж из движения товара"
```

---

### Task 5: `computeAging` — возраст остатка

Спека §9: возраст = дней с последнего прихода, пока остаток > 0; флаг `stale`, если возраст > порога (по умолчанию 5). Устойчиво к нерегулярному заполнению.

**Files:**
- Create: `src/lib/domain/aging.ts`
- Test: `src/lib/domain/aging.test.ts`

- [ ] **Step 1: Написать падающий тест**

Create `src/lib/domain/aging.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { computeAging, type MovementPoint } from './aging';

const hist = (rows: Array<[string, number | null, number | null]>): MovementPoint[] =>
  rows.map(([date, prihod, ostatok]) => ({ date, prihod, ostatok }));

describe('computeAging', () => {
  it('последний приход 6 дней назад, остаток > 0 → stale при пороге 5', () => {
    const h = hist([
      ['2026-06-01', 10, 5],
      ['2026-06-03', null, 5],
    ]);
    expect(computeAging(h, '2026-06-07', 5)).toMatchObject({
      currentOstatok: 5,
      lastPrihodDate: '2026-06-01',
      ageDays: 6,
      stale: true,
    });
  });

  it('свежий приход вчера → не stale', () => {
    const h = hist([['2026-06-06', 6, 6]]);
    expect(computeAging(h, '2026-06-07', 5)).toMatchObject({ ageDays: 1, stale: false });
  });

  it('остаток 0 → не stale, возраст null', () => {
    const h = hist([['2026-06-01', 10, 0]]);
    expect(computeAging(h, '2026-06-07', 5)).toMatchObject({
      currentOstatok: 0,
      ageDays: null,
      stale: false,
    });
  });

  it('ровно на пороге (5 дней) — ещё не stale', () => {
    const h = hist([['2026-06-02', 4, 4]]);
    expect(computeAging(h, '2026-06-07', 5)).toMatchObject({ ageDays: 5, stale: false });
  });

  it('порог настраивается на товар', () => {
    const h = hist([['2026-06-04', 3, 3]]);
    expect(computeAging(h, '2026-06-07', 2)).toMatchObject({ ageDays: 3, stale: true });
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd ~/bakery-ops && npx vitest run src/lib/domain/aging.test.ts`
Expected: FAIL (Cannot find module './aging')

- [ ] **Step 3: Реализовать `computeAging`**

Create `src/lib/domain/aging.ts`:

```ts
export type MovementPoint = {
  date: string; // ISO yyyy-mm-dd
  prihod: number | null;
  ostatok: number | null;
};

export type AgingResult = {
  currentOstatok: number | null;
  lastPrihodDate: string | null;
  ageDays: number | null;
  stale: boolean;
};

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
}

export function computeAging(
  history: MovementPoint[],
  asOf: string,
  shelfLifeDays = 5,
): AgingResult {
  const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
  const lastWithOstatok = [...sorted].reverse().find((m) => m.ostatok != null);
  const currentOstatok = lastWithOstatok?.ostatok ?? null;

  if (currentOstatok == null || currentOstatok <= 0) {
    return { currentOstatok, lastPrihodDate: null, ageDays: null, stale: false };
  }

  const lastPrihod = [...sorted].reverse().find((m) => (m.prihod ?? 0) > 0) ?? null;
  const lastPrihodDate = lastPrihod?.date ?? null;
  const baseDate = lastPrihodDate ?? sorted[0]?.date ?? null;
  const ageDays = baseDate ? daysBetween(baseDate, asOf) : null;
  const stale = ageDays != null && ageDays > shelfLifeDays;

  return { currentOstatok, lastPrihodDate, ageDays, stale };
}
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `cd ~/bakery-ops && npx vitest run src/lib/domain/aging.test.ts`
Expected: PASS

- [ ] **Step 5: Закоммитить**

```bash
cd ~/bakery-ops
git add src/lib/domain/aging.ts src/lib/domain/aging.test.ts
git commit -m "feat(domain): computeAging — возраст остатка и флаг залежалости"
```

---

### Task 6: Схема Prisma (модель данных §5)

Описываем схему. Миграцию против реальной БД делаем в плане данных — здесь достаточно `validate` и `generate` (не требуют живой БД).

**Files:**
- Create: `prisma/schema.prisma` (через `prisma init`, затем перезаписать модель)
- Modify: `.gitignore` (Prisma уже добавит `.env`, проверяем)

- [ ] **Step 1: Установить и инициализировать Prisma**

```bash
cd ~/bakery-ops
npm install -D prisma
npm install @prisma/client
npx --yes prisma init --datasource-provider postgresql
```

- [ ] **Step 2: Записать схему данных**

Заменить содержимое `prisma/schema.prisma` на:

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum SheetType {
  pies
  desserts
  confectionery_freeform
}

enum PointScope {
  both
  point1
  point2
}

enum SheetStatus {
  uploaded
  recognized
  needs_review
  confirmed
}

enum SheetSource {
  telegram
  web
}

enum UnknownLineStatus {
  pending
  mapped
  ignored
}

model Point {
  id        String     @id @default(cuid())
  name      String     @unique
  createdAt DateTime   @default(now())
  movements Movement[]
  sheets    Sheet[]
}

model Product {
  id            String      @id @default(cuid())
  name          String
  sheetType     SheetType
  pointScope    PointScope  @default(both)
  shelfLifeDays Int?
  defaultPrice  Decimal?    @db.Decimal(10, 2)
  aliases       String[]    @default([])
  active        Boolean     @default(true)
  createdAt     DateTime    @default(now())
  movements     Movement[]

  @@unique([name, sheetType])
}

model Sheet {
  id              String      @id @default(cuid())
  pointId         String
  point           Point       @relation(fields: [pointId], references: [id])
  sheetType       SheetType
  imageUrl        String
  imageHash       String
  dates           DateTime[]  @db.Date
  source          SheetSource
  uploadedBy      String?
  status          SheetStatus @default(uploaded)
  rawRecognition  Json?
  createdAt       DateTime    @default(now())
  confirmedAt     DateTime?
  movements       Movement[]
  unknownLines    UnknownLine[]

  @@index([pointId, sheetType])
  @@index([imageHash])
}

model Movement {
  id             String   @id @default(cuid())
  pointId        String
  point          Point    @relation(fields: [pointId], references: [id])
  productId      String
  product        Product  @relation(fields: [productId], references: [id])
  date           DateTime @db.Date
  prihod         Int?
  ostatok        Int?
  spisanie       Int?
  soldCalc       Int?
  sheetId        String?
  sheet          Sheet?   @relation(fields: [sheetId], references: [id])
  confidence     Float?
  rawCell        Json?
  manuallyEdited Boolean  @default(false)
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@unique([pointId, productId, date])
  @@index([date])
}

model UnknownLine {
  id              String            @id @default(cuid())
  sheetId         String
  sheet           Sheet             @relation(fields: [sheetId], references: [id])
  pointId         String
  date            DateTime?         @db.Date
  rawText         String
  parsedNumbers   Json?
  status          UnknownLineStatus @default(pending)
  mappedProductId String?
  createdAt       DateTime          @default(now())
}
```

- [ ] **Step 3: Провалидировать схему**

Run: `cd ~/bakery-ops && npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 4: Сгенерировать клиент (без БД)**

Run: `cd ~/bakery-ops && npx prisma generate`
Expected: `Generated Prisma Client` (без ошибок)

- [ ] **Step 5: Убедиться, что `.env` игнорируется git**

Run: `cd ~/bakery-ops && git check-ignore .env && echo IGNORED`
Expected: выводит `.env` и `IGNORED` (Prisma init добавляет `.env` в `.gitignore`; если нет — добавить строку `.env` в `.gitignore`)

- [ ] **Step 6: Закоммитить (без `.env`)**

```bash
cd ~/bakery-ops
git add prisma/schema.prisma .gitignore
git commit -m "feat(db): Prisma schema — points/products/sheets/movements/unknown_lines"
```

---

### Task 7: Сид мастер-каталога SKU

Типизированный каталог из реальных позиций с фото + валидация (уникальность имени в рамках типа листа, корректные значения).

**Files:**
- Create: `src/lib/catalog/seed-catalog.ts`
- Test: `src/lib/catalog/seed-catalog.test.ts`

- [ ] **Step 1: Написать падающий тест**

Create `src/lib/catalog/seed-catalog.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { SEED_CATALOG, type SeedProduct } from './seed-catalog';

describe('SEED_CATALOG', () => {
  it('не пустой', () => {
    expect(SEED_CATALOG.length).toBeGreaterThan(0);
  });

  it('имя уникально в рамках типа листа', () => {
    const keys = SEED_CATALOG.map((p) => `${p.sheetType}::${p.name}`);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('у каждой позиции валидные поля', () => {
    const types = new Set(['pies', 'desserts', 'confectionery_freeform']);
    const scopes = new Set(['both', 'point1', 'point2']);
    for (const p of SEED_CATALOG) {
      expect(p.name.trim().length).toBeGreaterThan(0);
      expect(types.has(p.sheetType)).toBe(true);
      expect(scopes.has(p.pointScope)).toBe(true);
      if (p.shelfLifeDays != null) expect(p.shelfLifeDays).toBeGreaterThan(0);
    }
  });

  it('содержит реальные позиции с листов', () => {
    const names = SEED_CATALOG.map((p) => p.name);
    expect(names).toContain('Самса');
    expect(names).toContain('Пицца открытая');
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd ~/bakery-ops && npx vitest run src/lib/catalog/seed-catalog.test.ts`
Expected: FAIL (Cannot find module './seed-catalog')

- [ ] **Step 3: Реализовать сид-каталог**

Create `src/lib/catalog/seed-catalog.ts` (стартовый набор из фото; расширяется в админке):

```ts
import type { SheetType, PointScope } from '@/lib/domain/types';

export type SeedProduct = {
  name: string;
  sheetType: SheetType;
  pointScope: PointScope;
  shelfLifeDays?: number;
  aliases?: string[];
};

export const SEED_CATALOG: SeedProduct[] = [
  // --- Пироги / выпечка (Точка 1) ---
  { name: 'Самса', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Перемяч', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Беляш татарский', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пирожок зел лук и яйцо', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пирожок с картошкой', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пирожок с капустой', sheetType: 'pies', pointScope: 'point1', aliases: ['Пирожок (беккен) с капустой'] },
  { name: 'Пирожок с печенью', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пицца закрытая', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пицца барбекю', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пицца открытая', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пицца сырная', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Пицца куриная', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Сосиска в тесте', sheetType: 'pies', pointScope: 'point1', aliases: ['Сосиска в тексе'] },
  { name: 'Хачапури', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Хот-дог', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Ватрушка', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Творожники', sheetType: 'pies', pointScope: 'point1' },
  { name: 'Кекс домашний', sheetType: 'pies', pointScope: 'point1' },

  // --- Десерты (обе точки), срок годности → aging ---
  { name: 'Манго Маракуйя', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Клубничное облако', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Каскейл Сникерс', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Красный бархат', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Медовик Карамель', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Чизкейк клубничный', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5, aliases: ['Чизкейл клубничный'] },
  { name: 'Бенто Орео', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Зимняя вишня', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Эстерхази', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
  { name: 'Тарт', sheetType: 'desserts', pointScope: 'both', shelfLifeDays: 5 },
];
```

- [ ] **Step 4: Запустить тест — убедиться, что проходит**

Run: `cd ~/bakery-ops && npx vitest run src/lib/catalog/seed-catalog.test.ts`
Expected: PASS

- [ ] **Step 5: Прогнать весь набор тестов**

Run: `cd ~/bakery-ops && npm test`
Expected: PASS (parseQuantity + computeSold + aging + seed-catalog)

- [ ] **Step 6: Закоммитить**

```bash
cd ~/bakery-ops
git add src/lib/catalog/seed-catalog.ts src/lib/catalog/seed-catalog.test.ts
git commit -m "feat(catalog): сид мастер-каталога SKU с фото листов"
```

---

## Дальнейшие планы (контекст, не для исполнения здесь)

- **Plan 2 — Recognition:** интерфейс `recognizeSheet(image, catalog, sheetType) → RecognitionResult` (Anthropic vision, строгий JSON через tool-use), нормализация через `parseQuantity`, маппинг строк на каталог + `unknown_lines`. Тесты: схема/нормализация на фикстурах + интеграция на реальных фото.
- **Plan 3 — Capture & Confirm:** Telegram-webhook (allowlist), веб-загрузка, миграция БД + репозитории (upsert movements по `(point, product, date)`, дедуп листов по `imageHash`), UI ревью с подсветкой неуверенных ячеек и «Остатка», обработка `unknown_lines`, NextAuth.
- **Plan 4 — Dashboard & Aging:** экраны остатков/продаж/списаний по точкам/дням; блок «Залежалось > N дней» (Точка 2) на `computeAging`; опц. Telegram-дайджест.

## Self-review (выполнено при написании)

- **Покрытие спеки данным планом:** §1 семантика → Task 3; §5 модель данных → Task 6; §8 продано → Task 4; §9 aging → Task 5; сид каталога → Task 7. Распознавание/поток/дашборд/auth — явно вынесены в планы 2–4.
- **Плейсхолдеры:** нет — в каждом шаге полный код/команда и ожидаемый результат.
- **Согласованность типов:** `ParsedQuantity`/`SheetType`/`PointScope` определены в Task 2 и используются в Tasks 3, 7; `MovementPoint` определён и используется внутри Task 5; имена функций (`parseQuantity`, `computeSold`, `computeAging`) единообразны между тестами и реализациями; имена полей Prisma согласованы с доменными расчётами (`prihod`/`ostatok`/`spisanie`/`soldCalc`).

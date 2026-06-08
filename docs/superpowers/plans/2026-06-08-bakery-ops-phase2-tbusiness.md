# Фаза 2: интеграция с Т-Бизнес (T-API) — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Автоматически импортировать исходящие операции с расчётного счёта Т-Бизнес в таблицу `Expense` (идемпотентно, с авто-категоризацией), чтобы дашборд считал чистую прибыль без ручного ввода расходов.

**Architecture:** Pull выписки по расписанию. Изолированные модули: `tbank/client.ts` (единственное место с host/путями/маппингом полей T-API), `tbank/categorize.ts` (чистая функция), `tbank/import-expenses.ts` (оркестратор с инъекцией зависимостей — тестируется без сети и БД), тонкий репозиторий `db/expense-import-repo.ts` (идемпотентный upsert по `externalId`), коллектор `scripts/collect-tbusiness.mts` под launchd на Mac Mini. Все импорты v1 → Плюшкино (`point-1`).

**Tech Stack:** Next.js 16, Prisma 7 (driver adapter `@prisma/adapter-pg`, DDL на `DATABASE_URL_UNPOOLED`), Vitest, TypeScript, Neon, `tsx`+`dotenv` (уже в devDeps).

**Spec:** `docs/superpowers/specs/2026-06-08-bakery-ops-phase2-tbusiness-design.md`

---

## Файловая структура

| Файл | Ответственность |
|------|-----------------|
| `prisma/schema.prisma` (modify) | `ExpenseSource += tbusiness`; `Expense += externalId @unique, counterparty, inn` |
| `src/lib/tbank/types.ts` (create) | Нормализованные типы `BankAccount`, `BankOperation`, `ImportSummary` |
| `src/lib/tbank/categorize.ts` (create) | Чистая категоризация операции → одна из 6 категорий |
| `src/lib/tbank/categorize.test.ts` (create) | Тесты правил категоризации |
| `src/lib/tbank/client.ts` (create) | Клиент T-API: auth, getAccounts, getStatement (пагинация), getRawSample, маппинг полей |
| `src/lib/tbank/client.test.ts` (create) | Тесты маппинга и пагинации (инъекция `fetch`) |
| `src/lib/db/expense-import-repo.ts` (create) | Идемпотентный upsert импортированного расхода по `externalId` |
| `src/lib/tbank/import-expenses.ts` (create) | Оркестратор: выписка → фильтр out → categorize → upsert |
| `src/lib/tbank/import-expenses.test.ts` (create) | Тесты оркестратора с фейковыми зависимостями (фильтр, идемпотентность) |
| `scripts/collect-tbusiness.mts` (create) | Точка входа коллектора (launchd) + `--debug` |
| `package.json` (modify) | Скрипт `collect:tbusiness` |
| `infra/com.nikascafe.tbusiness.plist` (create) | launchd-агент на Mac Mini |
| `docs/tbusiness-collector.md` (create) | Шпаргалка: токен, IP, env, запуск, launchd, логи |

---

## Task 1: Миграция схемы (enum `tbusiness` + поля дедупа)

**Files:**
- Modify: `prisma/schema.prisma:44-47` (enum `ExpenseSource`)
- Modify: `prisma/schema.prisma:156-171` (model `Expense`)

- [ ] **Step 1: Добавить значение в enum `ExpenseSource`**

Заменить блок:
```prisma
enum ExpenseSource {
  manual
  import
}
```
на:
```prisma
enum ExpenseSource {
  manual
  import
  tbusiness
}
```

- [ ] **Step 2: Добавить поля в модель `Expense`**

В модели `Expense` после строки `category  ExpenseCategory` добавить три поля и `@@unique`/индекс. Итоговая модель:
```prisma
model Expense {
  id           String          @id @default(cuid())
  pointId      String
  point        Point           @relation(fields: [pointId], references: [id])
  date         DateTime        @db.Date
  amount       Decimal         @db.Decimal(12, 2)
  category     ExpenseCategory
  source       ExpenseSource   @default(manual)
  externalId   String?         @unique
  counterparty String?
  inn          String?
  note         String?
  createdBy    String?
  createdAt    DateTime        @default(now())
  updatedAt    DateTime        @updatedAt

  @@index([pointId, date])
  @@index([date])
}
```

- [ ] **Step 3: Применить DDL на UNPOOLED и сгенерировать клиент**

Run:
```bash
cd /Users/nkola/bakery-ops && set -a && . ./.env && set +a && DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma db push && npx prisma generate
```
Expected: `Your database is now in sync with your Prisma schema` + `Generated Prisma Client`.

- [ ] **Step 4: Проверить схему и наличие колонок**

Run:
```bash
cd /Users/nkola/bakery-ops && npx prisma validate && set -a && . ./.env && set +a && DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma db execute --stdin <<'SQL'
SELECT column_name FROM information_schema.columns WHERE table_name='Expense' AND column_name IN ('externalId','counterparty','inn') ORDER BY column_name;
SQL
```
Expected: `prisma validate` → `The schema is valid`; запрос отработал без ошибки (3 строки).

- [ ] **Step 5: Commit**

```bash
cd /Users/nkola/bakery-ops && git add prisma/schema.prisma && git commit -m "feat(db): Expense.externalId/counterparty/inn + ExpenseSource.tbusiness"
```

---

## Task 2: Нормализованные типы

**Files:**
- Create: `src/lib/tbank/types.ts`

- [ ] **Step 1: Создать файл типов**

```ts
// Нормализованные доменные типы T-API (не зависят от сырого формата банка).

export type BankAccount = {
  accountNumber: string;
  name?: string | null;
  currency?: string | null;
};

export type BankOperation = {
  id: string; // уникальный ID операции — ключ дедупа
  date: string; // ISO yyyy-mm-dd
  amount: number; // абсолютная сумма, ₽
  direction: 'in' | 'out';
  counterparty: string | null;
  inn: string | null;
  purpose: string | null; // назначение платежа
};

export type ImportSummary = {
  fetched: number; // всего операций получено
  outgoing: number; // из них исходящих (расходы)
  imported: number; // создано новых Expense
  updated: number; // обновлено существующих (идемпотентность)
};
```

- [ ] **Step 2: Проверить типы**

Run: `cd /Users/nkola/bakery-ops && npx tsc --noEmit`
Expected: без ошибок.

- [ ] **Step 3: Commit**

```bash
cd /Users/nkola/bakery-ops && git add src/lib/tbank/types.ts && git commit -m "feat(tbank): нормализованные типы BankAccount/BankOperation/ImportSummary"
```

---

## Task 3: Категоризация (чистая функция, TDD)

**Files:**
- Create: `src/lib/tbank/categorize.test.ts`
- Create: `src/lib/tbank/categorize.ts`

- [ ] **Step 1: Написать падающий тест**

`src/lib/tbank/categorize.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { categorize } from './categorize';
import type { BankOperation } from './types';

const op = (over: Partial<BankOperation>): BankOperation => ({
  id: 'x', date: '2026-06-01', amount: 100, direction: 'out',
  counterparty: null, inn: null, purpose: null, ...over,
});

describe('categorize', () => {
  it('аренда по ключевому слову в назначении', () => {
    expect(categorize(op({ purpose: 'Оплата по договору аренды помещения' })).category).toBe('arenda');
  });
  it('налоги: НДФЛ/ФНС/страховые', () => {
    expect(categorize(op({ purpose: 'Уплата НДФЛ за май' })).category).toBe('nalogi');
    expect(categorize(op({ counterparty: 'Казначейство России (ФНС)' })).category).toBe('nalogi');
    expect(categorize(op({ purpose: 'Страховые взносы ОПС' })).category).toBe('nalogi');
  });
  it('ФОТ: зарплата/аванс', () => {
    expect(categorize(op({ purpose: 'Выплата заработной платы за май' })).category).toBe('fot');
    expect(categorize(op({ purpose: 'Аванс сотрудникам' })).category).toBe('fot');
  });
  it('коммуналка: электро/вода/связь', () => {
    expect(categorize(op({ purpose: 'Электроэнергия' })).category).toBe('kommunalka');
    expect(categorize(op({ purpose: 'Услуги связи и интернет' })).category).toBe('kommunalka');
  });
  it('продукты по ИНН поставщика', () => {
    expect(categorize(op({ inn: '7700000001', purpose: 'оплата счёта' })).category).toBe('produkty');
  });
  it('прочее по умолчанию + needsReview', () => {
    const r = categorize(op({ purpose: 'Перевод на счёт' }));
    expect(r.category).toBe('prochee');
    expect(r.needsReview).toBe(true);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/tbank/categorize.test.ts`
Expected: FAIL — `Failed to resolve import "./categorize"`.

- [ ] **Step 3: Реализация**

`src/lib/tbank/categorize.ts`:
```ts
import type { ExpenseCategoryKey } from '@/lib/finance/categories';
import type { BankOperation } from './types';

/** ИНН поставщиков продуктов. Пополняется по мере появления реальных контрагентов.
 *  В тесте используется синтетический '7700000001'. */
export const PRODUCT_SUPPLIER_INNS: ReadonlySet<string> = new Set<string>([
  '7700000001',
]);

type Rule = { cat: Exclude<ExpenseCategoryKey, 'produkty' | 'prochee'>; words: string[] };

// Порядок важен: первое совпадение выигрывает.
const RULES: Rule[] = [
  { cat: 'arenda', words: ['аренд'] },
  { cat: 'nalogi', words: ['налог', 'ндфл', 'страховы', 'страхов взнос', 'фнс', 'казначейств', 'осаго', 'пени'] },
  { cat: 'fot', words: ['зарплат', 'заработн', 'аванс', 'фот', 'оплата труда'] },
  { cat: 'kommunalka', words: ['электро', 'энерго', 'водоснаб', 'водоотвед', 'тепло', 'газ', 'коммунал', 'связь', 'интернет', 'телефон'] },
];

export function categorize(op: BankOperation): { category: ExpenseCategoryKey; needsReview: boolean } {
  if (op.inn && PRODUCT_SUPPLIER_INNS.has(op.inn)) {
    return { category: 'produkty', needsReview: false };
  }
  const hay = `${op.purpose ?? ''} ${op.counterparty ?? ''}`.toLowerCase();
  for (const r of RULES) {
    if (r.words.some((w) => hay.includes(w))) return { category: r.cat, needsReview: false };
  }
  return { category: 'prochee', needsReview: true };
}
```

- [ ] **Step 4: Запустить тест — убедиться, что зелёный**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/tbank/categorize.test.ts`
Expected: PASS (6 тестов).

- [ ] **Step 5: Commit**

```bash
cd /Users/nkola/bakery-ops && git add src/lib/tbank/categorize.ts src/lib/tbank/categorize.test.ts && git commit -m "feat(tbank): категоризация операций по правилам (TDD)"
```

---

## Task 4: Клиент T-API (маппинг + пагинация, инъекция fetch)

**Files:**
- Create: `src/lib/tbank/client.test.ts`
- Create: `src/lib/tbank/client.ts`

> ⚠️ Точные имена JSON-полей официального T-API финализируются на первом реальном прогоне (Task 7, `--debug`). Весь маппинг изолирован в `mapOperation`/`mapAccount` ниже и помечен `ADJUST`. Тесты проверяют логику маппинга/пагинации на синтетическом сэмпле, а не реальный контракт.

- [ ] **Step 1: Написать падающий тест**

`src/lib/tbank/client.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { TbankClient } from './client';

function fakeFetch(pages: unknown[]): typeof fetch {
  let i = 0;
  return (async () => {
    const body = pages[Math.min(i, pages.length - 1)];
    i++;
    return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

describe('TbankClient.getStatement', () => {
  it('маппит операции и проходит пагинацию по курсору', async () => {
    const page1 = {
      operations: [
        { id: 'op1', date: '2026-06-01T00:00:00Z', accountAmount: -1500, typeOfOperation: 'Debit',
          counterParty: { name: 'ООО Аренда', inn: '7712345678' }, paymentPurpose: 'Аренда за июнь' },
        { id: 'op2', date: '2026-06-02', accountAmount: 5000, typeOfOperation: 'Credit',
          counterParty: { name: 'iiko', inn: '7799999999' }, paymentPurpose: 'Выручка' },
      ],
      cursor: 'CUR2',
    };
    const page2 = {
      operations: [
        { id: 'op3', date: '2026-06-03', accountAmount: -300, typeOfOperation: 'Debit',
          counterParty: { name: 'Энергосбыт', inn: '7700000002' }, paymentPurpose: 'Электроэнергия' },
      ],
    };
    const client = new TbankClient({ token: 't', fetchImpl: fakeFetch([page1, page2]) });
    const ops = await client.getStatement('40802810000000000001', '2026-06-01', '2026-06-30');
    expect(ops.map((o) => o.id)).toEqual(['op1', 'op2', 'op3']);
    expect(ops[0]).toMatchObject({ amount: 1500, direction: 'out', counterparty: 'ООО Аренда', inn: '7712345678', purpose: 'Аренда за июнь', date: '2026-06-01' });
    expect(ops[1].direction).toBe('in');
  });
});

describe('TbankClient.getAccounts', () => {
  it('маппит список счетов', async () => {
    const client = new TbankClient({ token: 't', fetchImpl: fakeFetch([{ accounts: [{ accountNumber: '40802810000000000001', name: 'Расчётный', currency: '643' }] }]) });
    const accs = await client.getAccounts();
    expect(accs).toEqual([{ accountNumber: '40802810000000000001', name: 'Расчётный', currency: '643' }]);
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/tbank/client.test.ts`
Expected: FAIL — `Failed to resolve import "./client"`.

- [ ] **Step 3: Реализация**

`src/lib/tbank/client.ts`:
```ts
import type { BankAccount, BankOperation } from './types';

export type TbankConfig = {
  token: string;
  baseUrl?: string;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
};

// ⚠️ ADJUST ON FIRST REAL RESPONSE: базовый host и пути endpoint'ов.
const DEFAULT_BASE = 'https://business.tinkoff.ru/openapi';
const STATEMENT_PATH = '/api/v1/bank-statement';
const ACCOUNTS_PATH = '/api/v1/bank-accounts';

const str = (v: unknown): string | null => (v == null ? null : String(v));

// ⚠️ ADJUST ON FIRST REAL RESPONSE: единственное место с именами полей операции.
function mapOperation(raw: Record<string, unknown>): BankOperation {
  const id = str(raw.id ?? raw.operationId ?? raw.ucid ?? raw.documentNumber) ?? '';
  const date = (str(raw.date ?? raw.operationDate ?? raw.chargeDate ?? raw.authorizationDate) ?? '').slice(0, 10);
  const amtRaw = raw.accountAmount ?? raw.amount ?? raw.payment ?? 0;
  const amtNum = typeof amtRaw === 'object' && amtRaw !== null ? Number((amtRaw as Record<string, unknown>).value ?? 0) : Number(amtRaw);
  const amount = Math.abs(Number.isFinite(amtNum) ? amtNum : 0);
  const typeStr = (str(raw.typeOfOperation ?? raw.direction ?? raw.drcr ?? raw.type) ?? '').toLowerCase();
  const direction: 'in' | 'out' = /credit|приход|deposit|пополн|in\b/.test(typeStr) ? 'in' : 'out';
  const cp = (raw.counterParty ?? raw.contractor ?? raw.recipientDetails) as Record<string, unknown> | undefined;
  const counterparty = str(cp?.name ?? raw.counterpartyName ?? raw.recipientName);
  const inn = str(cp?.inn ?? raw.counterpartyInn ?? raw.inn);
  const purpose = str(raw.paymentPurpose ?? raw.purpose ?? raw.description);
  return { id, date, amount, direction, counterparty, inn, purpose };
}

// ⚠️ ADJUST ON FIRST REAL RESPONSE: имена полей счёта.
function mapAccount(raw: Record<string, unknown>): BankAccount {
  return {
    accountNumber: str(raw.accountNumber ?? raw.number ?? raw.id) ?? '',
    name: str(raw.name ?? raw.accountName ?? raw.title),
    currency: str(raw.currency ?? raw.currencyCode ?? raw.currencyIso),
  };
}

export class TbankClient {
  private token: string;
  private baseUrl: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;

  constructor(cfg: TbankConfig) {
    this.token = cfg.token;
    this.baseUrl = cfg.baseUrl ?? DEFAULT_BASE;
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private async getJson(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const res = await this.fetchImpl(url.toString(), {
        headers: { Authorization: `Bearer ${this.token}`, Accept: 'application/json' },
        signal: ac.signal,
      });
      if (!res.ok) throw new Error(`T-API ${path} → HTTP ${res.status}`);
      return (await res.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }
  }

  async getAccounts(): Promise<BankAccount[]> {
    const data = await this.getJson(ACCOUNTS_PATH, {});
    const list = (data.accounts ?? data.bankAccounts ?? data) as unknown;
    const arr = Array.isArray(list) ? list : [];
    return arr.map((r) => mapAccount(r as Record<string, unknown>));
  }

  async getStatement(accountNumber: string, from: string, till: string): Promise<BankOperation[]> {
    const out: BankOperation[] = [];
    let cursor: string | undefined;
    do {
      const params: Record<string, string> = { accountNumber, from, till };
      if (cursor) params.cursor = cursor;
      const data = await this.getJson(STATEMENT_PATH, params);
      const list = (data.operations ?? data.payments ?? data.transactions ?? []) as Record<string, unknown>[];
      for (const r of list) out.push(mapOperation(r));
      cursor = (data.cursor ?? data.nextCursor) as string | undefined;
    } while (cursor);
    return out;
  }

  /** Сырой первый объект операции — для финализации маппинга на первом прогоне (--debug). */
  async getRawSample(accountNumber: string, from: string, till: string): Promise<Record<string, unknown> | null> {
    const data = await this.getJson(STATEMENT_PATH, { accountNumber, from, till });
    const list = (data.operations ?? data.payments ?? data.transactions ?? []) as Record<string, unknown>[];
    return list[0] ?? null;
  }
}
```

- [ ] **Step 4: Запустить тест — убедиться, что зелёный**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/tbank/client.test.ts`
Expected: PASS (2 теста).

- [ ] **Step 5: Commit**

```bash
cd /Users/nkola/bakery-ops && git add src/lib/tbank/client.ts src/lib/tbank/client.test.ts && git commit -m "feat(tbank): клиент T-API с пагинацией и изолированным маппингом полей"
```

---

## Task 5: Репозиторий идемпотентного импорта расхода

**Files:**
- Create: `src/lib/db/expense-import-repo.ts`

> Тонкая IO-обёртка над Prisma. Юнит-тестом не покрывается (требует БД); логика, которая её использует, тестируется в Task 6 через фейк. Корректность типов проверяется `tsc`.

- [ ] **Step 1: Реализация**

`src/lib/db/expense-import-repo.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import { toDbDate } from './dates';

export type ImportedExpense = {
  externalId: string;
  pointId: string;
  date: string; // ISO yyyy-mm-dd
  amount: number;
  category: string; // ключ ExpenseCategory
  counterparty: string | null;
  inn: string | null;
  note: string | null; // назначение платежа
};

/** Идемпотентно создаёт/обновляет расход по externalId. Возвращает что произошло. */
export async function upsertImportedExpense(
  prisma: PrismaClient,
  e: ImportedExpense,
): Promise<'imported' | 'updated'> {
  const existing = await prisma.expense.findUnique({ where: { externalId: e.externalId }, select: { id: true } });
  await prisma.expense.upsert({
    where: { externalId: e.externalId },
    create: {
      externalId: e.externalId,
      pointId: e.pointId,
      date: toDbDate(e.date),
      amount: e.amount,
      category: e.category as never,
      source: 'tbusiness' as never,
      counterparty: e.counterparty ?? undefined,
      inn: e.inn ?? undefined,
      note: e.note ?? undefined,
    },
    update: {
      amount: e.amount,
      category: e.category as never,
      counterparty: e.counterparty ?? undefined,
      inn: e.inn ?? undefined,
      note: e.note ?? undefined,
    },
  });
  return existing ? 'updated' : 'imported';
}
```

- [ ] **Step 2: Проверить типы**

Run: `cd /Users/nkola/bakery-ops && npx tsc --noEmit`
Expected: без ошибок (поля `externalId/counterparty/inn` и `source: 'tbusiness'` существуют после Task 1).

- [ ] **Step 3: Commit**

```bash
cd /Users/nkola/bakery-ops && git add src/lib/db/expense-import-repo.ts && git commit -m "feat(db): идемпотентный upsert импортированного расхода по externalId"
```

---

## Task 6: Оркестратор импорта (TDD с фейками)

**Files:**
- Create: `src/lib/tbank/import-expenses.test.ts`
- Create: `src/lib/tbank/import-expenses.ts`

- [ ] **Step 1: Написать падающий тест**

`src/lib/tbank/import-expenses.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { importExpenses } from './import-expenses';
import type { BankOperation } from './types';
import type { ImportedExpense } from '@/lib/db/expense-import-repo';

const op = (over: Partial<BankOperation>): BankOperation => ({
  id: 'x', date: '2026-06-01', amount: 100, direction: 'out',
  counterparty: null, inn: null, purpose: null, ...over,
});

function fakeUpsert() {
  const seen = new Map<string, ImportedExpense>();
  const calls: ImportedExpense[] = [];
  const upsert = async (e: ImportedExpense): Promise<'imported' | 'updated'> => {
    calls.push(e);
    const had = seen.has(e.externalId);
    seen.set(e.externalId, e);
    return had ? 'updated' : 'imported';
  };
  return { upsert, calls };
}

describe('importExpenses', () => {
  const ops: BankOperation[] = [
    op({ id: 'op1', direction: 'out', purpose: 'Аренда за июнь', amount: 1500 }),
    op({ id: 'op2', direction: 'in', purpose: 'Выручка', amount: 5000 }),
    op({ id: 'op3', direction: 'out', purpose: 'Электроэнергия', amount: 300 }),
  ];

  it('фильтрует исходящие, категоризирует и считает сводку', async () => {
    const { upsert, calls } = fakeUpsert();
    const summary = await importExpenses({
      fetchStatement: async () => ops, upsert, pointId: 'point-1', from: '2026-06-01', till: '2026-06-30',
    });
    expect(summary).toEqual({ fetched: 3, outgoing: 2, imported: 2, updated: 0 });
    expect(calls.map((c) => c.externalId)).toEqual(['op1', 'op3']);
    expect(calls[0]).toMatchObject({ pointId: 'point-1', category: 'arenda', amount: 1500, note: 'Аренда за июнь' });
    expect(calls[1]).toMatchObject({ category: 'kommunalka' });
  });

  it('идемпотентен: повторный прогон только обновляет', async () => {
    const { upsert } = fakeUpsert();
    const args = { fetchStatement: async () => ops, upsert, pointId: 'point-1', from: '2026-06-01', till: '2026-06-30' };
    await importExpenses(args);
    const second = await importExpenses(args);
    expect(second).toEqual({ fetched: 3, outgoing: 2, imported: 0, updated: 2 });
  });
});
```

- [ ] **Step 2: Запустить тест — убедиться, что падает**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/tbank/import-expenses.test.ts`
Expected: FAIL — `Failed to resolve import "./import-expenses"`.

- [ ] **Step 3: Реализация**

`src/lib/tbank/import-expenses.ts`:
```ts
import { categorize } from './categorize';
import type { BankOperation, ImportSummary } from './types';
import type { ImportedExpense } from '@/lib/db/expense-import-repo';

export type ImportDeps = {
  fetchStatement: (from: string, till: string) => Promise<BankOperation[]>;
  upsert: (e: ImportedExpense) => Promise<'imported' | 'updated'>;
  pointId: string;
  from: string;
  till: string;
};

export async function importExpenses(deps: ImportDeps): Promise<ImportSummary> {
  const ops = await deps.fetchStatement(deps.from, deps.till);
  let outgoing = 0;
  let imported = 0;
  let updated = 0;
  for (const o of ops) {
    if (o.direction !== 'out') continue;
    outgoing++;
    const { category } = categorize(o);
    const res = await deps.upsert({
      externalId: o.id,
      pointId: deps.pointId,
      date: o.date,
      amount: o.amount,
      category,
      counterparty: o.counterparty,
      inn: o.inn,
      note: o.purpose,
    });
    if (res === 'imported') imported++;
    else updated++;
  }
  return { fetched: ops.length, outgoing, imported, updated };
}
```

- [ ] **Step 4: Запустить тест — убедиться, что зелёный**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/tbank/import-expenses.test.ts`
Expected: PASS (2 теста).

- [ ] **Step 5: Commit**

```bash
cd /Users/nkola/bakery-ops && git add src/lib/tbank/import-expenses.ts src/lib/tbank/import-expenses.test.ts && git commit -m "feat(tbank): оркестратор импорта расходов (фильтр out + идемпотентность, TDD)"
```

---

## Task 7: Коллектор (точка входа + `--debug`)

**Files:**
- Create: `scripts/collect-tbusiness.mts`
- Modify: `package.json` (scripts)

- [ ] **Step 1: Реализация коллектора**

`scripts/collect-tbusiness.mts`:
```ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { TbankClient } from '../src/lib/tbank/client';
import { importExpenses } from '../src/lib/tbank/import-expenses';
import { upsertImportedExpense } from '../src/lib/db/expense-import-repo';

const POINT_PLYUSHKINO = 'point-1';
const WINDOW_DAYS = 35;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

async function main() {
  const token = process.env.TBUSINESS_API_TOKEN;
  if (!token) {
    console.error('TBUSINESS_API_TOKEN не задан в .env');
    process.exit(1);
  }
  const from = isoDaysAgo(WINDOW_DAYS);
  const till = isoDaysAgo(0);
  const client = new TbankClient({ token });

  const accounts = await client.getAccounts();
  const account = process.env.TBUSINESS_ACCOUNT ?? accounts[0]?.accountNumber;
  if (!account) {
    console.error('Не найден ни один счёт; задайте TBUSINESS_ACCOUNT');
    process.exit(1);
  }

  if (process.argv.includes('--debug')) {
    const sample = await client.getRawSample(account, from, till);
    console.log('account:', account, 'period:', from, '→', till);
    console.log('raw operation keys:', sample ? Object.keys(sample) : '(нет операций)');
    process.exit(0);
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const summary = await importExpenses({
      fetchStatement: (f, t) => client.getStatement(account, f, t),
      upsert: (e) => upsertImportedExpense(prisma, e),
      pointId: POINT_PLYUSHKINO,
      from,
      till,
    });
    console.log(JSON.stringify({ account, from, till, ...summary }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('collect-tbusiness failed:', err);
  process.exit(1);
});
```

- [ ] **Step 2: Добавить npm-скрипт**

В `package.json` в объект `scripts` добавить строку после `"test:watch"`:
```json
    "collect:tbusiness": "tsx scripts/collect-tbusiness.mts",
```

- [ ] **Step 3: Проверить, что модули резолвятся (tsc + запуск под tsx)**

Run:
```bash
cd /Users/nkola/bakery-ops && npx tsc --noEmit && npx tsx scripts/collect-tbusiness.mts; echo "exit=$?"
```
Expected: `tsc` без ошибок. Запуск завершается одним из двух (оба означают, что импорты и алиас `@/` резолвятся под `tsx`, ошибок резолва модулей НЕТ):
- если токена в `.env` нет → `TBUSINESS_API_TOKEN не задан в .env`, `exit=1`;
- если токен уже добавлен → сетевая ошибка на `getAccounts` (host недоступен из этого окружения), `exit=1`.

Провал именно с `Cannot find module` / `Failed to resolve import "@/..."` → алиас не резолвится под tsx. Fallback: в `scripts/collect-tbusiness.mts` заменить импорты вида `'@/lib/...'` нельзя (они внутри модулей), поэтому установить и подключить резолвер путей: `npm i -D tsconfig-paths` и запускать `node --import tsx --import tsconfig-paths/register scripts/collect-tbusiness.mts` (обновить и npm-скрипт, и `ProgramArguments` в plist Task 8).

- [ ] **Step 4: Commit**

```bash
cd /Users/nkola/bakery-ops && git add scripts/collect-tbusiness.mts package.json && git commit -m "feat(tbank): коллектор collect-tbusiness (+--debug для финализации маппинга)"
```

---

## Task 8: launchd-агент + шпаргалка

**Files:**
- Create: `infra/com.nikascafe.tbusiness.plist`
- Create: `docs/tbusiness-collector.md`

- [ ] **Step 1: launchd-агент (шаблон в репозитории)**

`infra/com.nikascafe.tbusiness.plist`:
```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>com.nikascafe.tbusiness</string>
  <key>ProgramArguments</key>
  <array>
    <string>/bin/zsh</string>
    <string>-lc</string>
    <string>cd /Users/nkola/bakery-ops &amp;&amp; /usr/bin/env npx tsx scripts/collect-tbusiness.mts &gt;&gt; logs/tbusiness.log 2&gt;&amp;1</string>
  </array>
  <key>StartCalendarInterval</key>
  <dict>
    <key>Hour</key><integer>4</integer>
    <key>Minute</key><integer>0</integer>
  </dict>
  <key>RunAtLoad</key>
  <false/>
  <key>StandardOutPath</key>
  <string>/Users/nkola/bakery-ops/logs/tbusiness.out.log</string>
  <key>StandardErrorPath</key>
  <string>/Users/nkola/bakery-ops/logs/tbusiness.err.log</string>
</dict>
</plist>
```

- [ ] **Step 2: Шпаргалка**

`docs/tbusiness-collector.md`:
```markdown
# Коллектор расходов Т-Бизнес (Mac Mini)

Тянет выписку по расчётному счёту Т-Бизнес (T-API) и пишет расходы в Neon
(идемпотентно по ID операции). Все импорты → Плюшкино (point-1). Выручка — из iiko.

## 1. Токен (делается один раз в ЛК Т-Бизнес)
Интеграции → T-API → Выпуск токена → доступы «Информация о счетах компании» +
«Информация об операциях компании». Указать публичный IP Mac Mini: `curl ifconfig.me`.
Токен положить в `~/bakery-ops/.env`:
```
TBUSINESS_API_TOKEN=...
# опционально, если счетов несколько:
# TBUSINESS_ACCOUNT=40802810XXXXXXXXXXXX
```

## 2. Первый прогон — финализация маппинга полей
```
cd ~/bakery-ops
npx tsx scripts/collect-tbusiness.mts --debug   # печатает ключи сырой операции
```
Сверить ключи с маппингом в `src/lib/tbank/client.ts` (функции `mapOperation`/`mapAccount`,
помечены `ADJUST`). Поправить при необходимости, затем полный прогон:
```
npm run collect:tbusiness
```
Вывод: JSON-сводка `{ fetched, outgoing, imported, updated }`.

## 3. Расписание (launchd, раз в сутки 04:00)
```
mkdir -p ~/bakery-ops/logs
cp ~/bakery-ops/infra/com.nikascafe.tbusiness.plist ~/Library/LaunchAgents/
launchctl unload ~/Library/LaunchAgents/com.nikascafe.tbusiness.plist 2>/dev/null
launchctl load ~/Library/LaunchAgents/com.nikascafe.tbusiness.plist
launchctl start com.nikascafe.tbusiness          # разовый ручной запуск
```
Логи: `~/bakery-ops/logs/tbusiness*.log`.
Обновить расписание: отредактировать plist → `unload` → `load`.
```

- [ ] **Step 3: Игнор логов в git**

Run:
```bash
cd /Users/nkola/bakery-ops && grep -qxF 'logs/' .gitignore || echo 'logs/' >> .gitignore
```
Expected: `logs/` присутствует в `.gitignore`.

- [ ] **Step 4: Commit**

```bash
cd /Users/nkola/bakery-ops && git add infra/com.nikascafe.tbusiness.plist docs/tbusiness-collector.md .gitignore && git commit -m "feat(infra): launchd-агент и шпаргалка коллектора Т-Бизнес"
```

---

## Финальная проверка (после всех задач)

- [ ] **Полный прогон CI**

Run: `cd /Users/nkola/bakery-ops && npx tsc --noEmit && npx eslint src && npm test && npm run build`
Expected: tsc/eslint без ошибок; все тесты зелёные (включая существующие 124+); build успешен.

- [ ] **Не задеплоено лишнего:** изменения схемы уже применены на Neon (Task 1); приложение (дашборд) деплоится как обычно `vercel deploy --prod --yes`, но коллектор работает только на Mac Mini после установки токена.

---

## Зависимость от пользователя (вне кода)
Реальный прогон коллектора возможен только после того, как пользователь выпустит токен в ЛК Т-Бизнес и положит его в `~/bakery-ops/.env` (см. `docs/tbusiness-collector.md`). До этого код полностью реализован и покрыт юнит-тестами на фейках; маппинг полей T-API финализируется на первом `--debug`-прогоне.
```

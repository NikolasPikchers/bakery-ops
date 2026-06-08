# Фаза 3: импорт выручки из iiko — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development или superpowers:executing-plans. Шаги — чекбоксы `- [ ]`.

**Goal:** Импортировать дневную выручку Плюшкино из iikoCloud (OLAP SALES) в таблицу `Revenue` (идемпотентно), чтобы дашборд считал чистую прибыль (выручка iiko − расходы Т-Бизнес).

**Architecture:** Изолированный клиент iikoCloud с **двойной авторизацией** (apiLogin→/api/1 ИЛИ appId+apiKey+clientSecret→/api/v2 — выяснено вживую, что у пользователя ключ требует v2). Оркестратор с инъекцией зависимостей (тест без сети/БД). Идемпотентный upsert по `pointId_date`. Запуск — CLI на Mac Mini. Всё → Плюшкино (point-1), `source:'iiko'`.

**Tech Stack:** Next.js 16, Prisma 7 (driver adapter, DDL на `DATABASE_URL_UNPOOLED`), Vitest, TS, Neon, tsx+dotenv.

**Spec:** `docs/superpowers/specs/2026-06-08-bakery-ops-phase3-iiko-design.md`

> Живой доступ к iiko сейчас заблокирован на стороне iiko (ключ требует v2-набор appId+apiKey+clientSecret, у пользователя только один apiLogin — ждём от iiko). Код пишется под мок; точные поля OLAP и рабочий способ авторизации финализируются на первом `--debug` с валидными кредами.

---

## Файловая структура

| Файл | Ответственность |
|------|-----------------|
| `prisma/schema.prisma` (mod) | `RevenueSource += iiko` |
| `src/lib/iiko/types.ts` (new) | `IikoOrg`, `DailyRevenue`, `RevenueImportSummary` |
| `src/lib/iiko/client.ts` (new) | Клиент iikoCloud: dual-auth, getOrganizations, getOlapSales, getOlapColumns. Единственное место с host/путями/полями OLAP |
| `src/lib/iiko/client.test.ts` (new) | Тесты маппинга OLAP/организаций (инъекция fetch) |
| `src/lib/iiko/import-revenue.ts` (new) | Оркестратор: дни выручки → upsert |
| `src/lib/iiko/import-revenue.test.ts` (new) | Тест оркестратора (идемпотентность) |
| `src/lib/db/finance-repo.ts` (mod) | Расширить `Source` на `'iiko'` |
| `src/lib/db/revenue-import-repo.ts` (new) | `upsertImportedRevenue` (трекинг imported/updated) |
| `scripts/import-iiko-revenue.mts` (new) | CLI: `--from/--till/--debug`, авторизация из env |
| `package.json` (mod) | скрипт `import:iiko` |
| `docs/iiko-import.md` (new) | Шпаргалка |

---

## Task 1: Миграция `RevenueSource += iiko`

**Files:** Modify `prisma/schema.prisma` (enum `RevenueSource`)

- [ ] **Step 1:** Заменить
```prisma
enum RevenueSource {
  manual
  import
}
```
на
```prisma
enum RevenueSource {
  manual
  import
  iiko
}
```

- [ ] **Step 2:** Применить и сгенерировать.
Run: `cd /Users/nkola/bakery-ops && set -a && . ./.env && set +a && DATABASE_URL="$DATABASE_URL_UNPOOLED" npx prisma db push --accept-data-loss && npx prisma generate`
Expected: `Your database is now in sync` + `Generated Prisma Client`.

- [ ] **Step 3:** Commit
`git add prisma/schema.prisma && git commit -m "feat(db): RevenueSource.iiko"`

---

## Task 2: Типы iiko

**Files:** Create `src/lib/iiko/types.ts`

- [ ] **Step 1:** Создать файл.
```ts
export type IikoOrg = { id: string; name: string };
export type DailyRevenue = { date: string; amount: number }; // ISO день, ₽ (нетто после скидок)
export type RevenueImportSummary = { days: number; imported: number; updated: number };
```
- [ ] **Step 2:** `npx tsc --noEmit` → без ошибок.
- [ ] **Step 3:** Commit `git add src/lib/iiko/types.ts && git commit -m "feat(iiko): типы"`

---

## Task 3: Репозиторий выручки (трекинг) + расширение Source

**Files:** Modify `src/lib/db/finance-repo.ts`; Create `src/lib/db/revenue-import-repo.ts`

- [ ] **Step 1:** В `finance-repo.ts` расширить тип источника:
```ts
type Source = 'manual' | 'import' | 'iiko';
```
- [ ] **Step 2:** Создать `src/lib/db/revenue-import-repo.ts`:
```ts
import type { PrismaClient } from '@prisma/client';
import { toDbDate } from './dates';
import { upsertRevenue } from './finance-repo';

/** Идемпотентно создаёт/обновляет дневную выручку. Возвращает что произошло. */
export async function upsertImportedRevenue(
  prisma: PrismaClient,
  e: { pointId: string; date: string; amount: number },
): Promise<'imported' | 'updated'> {
  const existing = await prisma.revenue.findUnique({
    where: { pointId_date: { pointId: e.pointId, date: toDbDate(e.date) } },
    select: { id: true },
  });
  await upsertRevenue(prisma, { pointId: e.pointId, date: e.date, amount: e.amount, source: 'iiko' });
  return existing ? 'updated' : 'imported';
}
```
- [ ] **Step 3:** `npx tsc --noEmit` → без ошибок.
- [ ] **Step 4:** Commit `git add src/lib/db/finance-repo.ts src/lib/db/revenue-import-repo.ts && git commit -m "feat(db): upsertImportedRevenue + Source 'iiko'"`

---

## Task 4: Клиент iikoCloud (dual-auth + OLAP)

**Files:** Create `src/lib/iiko/client.test.ts`, `src/lib/iiko/client.ts`

- [ ] **Step 1: Падающий тест** `src/lib/iiko/client.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { IikoClient } from './client';

function fakeFetch(byUrl: Record<string, unknown>): typeof fetch {
  return (async (url: string) => {
    const key = Object.keys(byUrl).find((k) => String(url).includes(k));
    return new Response(JSON.stringify(key ? byUrl[key] : {}), { status: 200, headers: { 'content-type': 'application/json' } });
  }) as unknown as typeof fetch;
}

describe('IikoClient', () => {
  it('apiLogin-режим: токен через /api/1, организации, OLAP→дни', async () => {
    const fetchImpl = fakeFetch({
      '/api/1/access_token': { token: 'TKN' },
      '/api/1/organizations': { organizations: [{ id: 'org1', name: 'Плюшкино' }] },
      '/api/1/reports/olap': { data: [
        { 'OpenDate.Typed': '2026-06-01', DishDiscountSumInt: 12345.5 },
        { 'OpenDate.Typed': '2026-06-02', DishDiscountSumInt: 9000 },
      ] },
    });
    const c = new IikoClient({ auth: { mode: 'apiLogin', apiLogin: 'x' }, fetchImpl });
    expect((await c.getOrganizations())[0]).toEqual({ id: 'org1', name: 'Плюшкино' });
    const days = await c.getOlapSales('org1', '2026-06-01', '2026-06-02');
    expect(days).toEqual([
      { date: '2026-06-01', amount: 12345.5 },
      { date: '2026-06-02', amount: 9000 },
    ]);
  });

  it('app-режим использует /api/v2/access_token', async () => {
    let hitV2 = false;
    const fetchImpl = (async (url: string) => {
      if (String(url).includes('/api/v2/access_token')) hitV2 = true;
      return new Response(JSON.stringify({ token: 'T', organizations: [] }), { status: 200, headers: { 'content-type': 'application/json' } });
    }) as unknown as typeof fetch;
    const c = new IikoClient({ auth: { mode: 'app', appId: 'a', apiKey: 'k', clientSecret: 's' }, fetchImpl });
    await c.getOrganizations();
    expect(hitV2).toBe(true);
  });
});
```
- [ ] **Step 2:** `npx vitest run src/lib/iiko/client.test.ts` → FAIL (нет `./client`).
- [ ] **Step 3: Реализация** `src/lib/iiko/client.ts`:
```ts
import type { DailyRevenue, IikoOrg } from './types';

export type IikoAuth =
  | { mode: 'apiLogin'; apiLogin: string }
  | { mode: 'app'; appId: string; apiKey: string; clientSecret: string };

export type IikoConfig = { auth: IikoAuth; baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch };

// ⚠️ ADJUST ON FIRST REAL RESPONSE: host/пути/поля OLAP.
const DEFAULT_BASE = 'https://api-ru.iiko.services';
const OLAP_REVENUE_FIELD = 'DishDiscountSumInt'; // нетто-выручка после скидок
const OLAP_DATE_FIELD = 'OpenDate.Typed';

export class IikoClient {
  private auth: IikoAuth;
  private baseUrl: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;
  private token: string | null = null;

  constructor(cfg: IikoConfig) {
    this.auth = cfg.auth;
    this.baseUrl = cfg.baseUrl ?? DEFAULT_BASE;
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private async post(path: string, body: unknown, auth = true): Promise<Record<string, unknown>> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth) headers.Authorization = `Bearer ${await this.getToken()}`;
      const res = await this.fetchImpl(this.baseUrl + path, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
      if (!res.ok) throw new Error(`iiko ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return (await res.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const [path, body] =
      this.auth.mode === 'apiLogin'
        ? ['/api/1/access_token', { apiLogin: this.auth.apiLogin }]
        : ['/api/v2/access_token', { appId: this.auth.appId, apiKey: this.auth.apiKey, clientSecret: this.auth.clientSecret }];
    const data = await this.post(path, body, false);
    const token = data.token as string | undefined;
    if (!token) throw new Error('iiko: токен не получен');
    this.token = token;
    return token;
  }

  async getOrganizations(): Promise<IikoOrg[]> {
    const data = await this.post('/api/1/organizations', { returnAdditionalInfo: false, includeDisabled: true });
    const orgs = (data.organizations ?? []) as Record<string, unknown>[];
    return orgs.map((o) => ({ id: String(o.id ?? ''), name: String(o.name ?? '') }));
  }

  private olapBody(orgId: string, from: string, till: string) {
    // ⚠️ ADJUST ON FIRST REAL RESPONSE
    return {
      organizationId: orgId,
      reportType: 'SALES',
      buildSummary: false,
      groupByRowFields: [OLAP_DATE_FIELD],
      groupByColFields: [],
      aggregateFields: [OLAP_REVENUE_FIELD],
      filters: { [OLAP_DATE_FIELD]: { filterType: 'DateRange', periodType: 'CUSTOM', from, to: till } },
    };
  }

  async getOlapSales(orgId: string, from: string, till: string): Promise<DailyRevenue[]> {
    const data = await this.post('/api/1/reports/olap', this.olapBody(orgId, from, till));
    const rows = (data.data ?? []) as Record<string, unknown>[];
    return rows.map((r) => ({
      date: String(r[OLAP_DATE_FIELD] ?? '').slice(0, 10),
      amount: Number(r[OLAP_REVENUE_FIELD] ?? 0) || 0,
    }));
  }

  /** Для --debug: список колонок SALES (финализация полей). */
  async getOlapColumns(): Promise<Record<string, unknown>> {
    return this.post('/api/1/reports/olap/columns/SALES', {});
  }
}
```
- [ ] **Step 4:** `npx vitest run src/lib/iiko/client.test.ts` → PASS.
- [ ] **Step 5:** Commit `git add src/lib/iiko/client.ts src/lib/iiko/client.test.ts && git commit -m "feat(iiko): клиент iikoCloud (dual-auth + OLAP SALES)"`

---

## Task 5: Оркестратор импорта выручки

**Files:** Create `src/lib/iiko/import-revenue.test.ts`, `src/lib/iiko/import-revenue.ts`

- [ ] **Step 1: Падающий тест** `src/lib/iiko/import-revenue.test.ts`:
```ts
import { describe, it, expect } from 'vitest';
import { importRevenue } from './import-revenue';
import type { DailyRevenue } from './types';

function fakeUpsert() {
  const seen = new Set<string>();
  const calls: { pointId: string; date: string; amount: number }[] = [];
  const upsert = async (pointId: string, date: string, amount: number): Promise<'imported' | 'updated'> => {
    calls.push({ pointId, date, amount });
    const k = `${pointId}|${date}`;
    const had = seen.has(k);
    seen.add(k);
    return had ? 'updated' : 'imported';
  };
  return { upsert, calls };
}

const days: DailyRevenue[] = [
  { date: '2026-06-01', amount: 12345.5 },
  { date: '2026-06-02', amount: 9000 },
  { date: '2026-06-03', amount: 0 },
];

describe('importRevenue', () => {
  it('импортирует дни с выручкой > 0, считает сводку', async () => {
    const { upsert, calls } = fakeUpsert();
    const s = await importRevenue({ fetchSales: async () => days, upsert, pointId: 'point-1', from: '2026-06-01', till: '2026-06-03' });
    expect(s).toEqual({ days: 2, imported: 2, updated: 0 });
    expect(calls.map((c) => c.date)).toEqual(['2026-06-01', '2026-06-02']);
    expect(calls[0]).toEqual({ pointId: 'point-1', date: '2026-06-01', amount: 12345.5 });
  });

  it('идемпотентен: повторный прогон только обновляет', async () => {
    const { upsert } = fakeUpsert();
    const args = { fetchSales: async () => days, upsert, pointId: 'point-1', from: '2026-06-01', till: '2026-06-03' };
    await importRevenue(args);
    expect(await importRevenue(args)).toEqual({ days: 2, imported: 0, updated: 2 });
  });
});
```
- [ ] **Step 2:** `npx vitest run src/lib/iiko/import-revenue.test.ts` → FAIL.
- [ ] **Step 3: Реализация** `src/lib/iiko/import-revenue.ts`:
```ts
import type { DailyRevenue, RevenueImportSummary } from './types';

export type RevenueImportDeps = {
  fetchSales: (from: string, till: string) => Promise<DailyRevenue[]>;
  upsert: (pointId: string, date: string, amount: number) => Promise<'imported' | 'updated'>;
  pointId: string;
  from: string;
  till: string;
};

export async function importRevenue(deps: RevenueImportDeps): Promise<RevenueImportSummary> {
  const all = await deps.fetchSales(deps.from, deps.till);
  let imported = 0;
  let updated = 0;
  let days = 0;
  for (const d of all) {
    if (!d.date || d.amount <= 0) continue;
    days++;
    const r = await deps.upsert(deps.pointId, d.date, d.amount);
    if (r === 'imported') imported++;
    else updated++;
  }
  return { days, imported, updated };
}
```
- [ ] **Step 4:** `npx vitest run src/lib/iiko/import-revenue.test.ts` → PASS.
- [ ] **Step 5:** Commit `git add src/lib/iiko/import-revenue.ts src/lib/iiko/import-revenue.test.ts && git commit -m "feat(iiko): оркестратор импорта выручки (идемпотентный)"`

---

## Task 6: CLI-скрипт + шпаргалка

**Files:** Create `scripts/import-iiko-revenue.mts`, `docs/iiko-import.md`; Modify `package.json`

- [ ] **Step 1:** `scripts/import-iiko-revenue.mts`:
```ts
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { IikoClient, type IikoAuth } from '../src/lib/iiko/client';
import { importRevenue } from '../src/lib/iiko/import-revenue';
import { upsertImportedRevenue } from '../src/lib/db/revenue-import-repo';

const POINT = 'point-1';

function authFromEnv(): IikoAuth {
  if (process.env.IIKO_API_LOGIN) return { mode: 'apiLogin', apiLogin: process.env.IIKO_API_LOGIN };
  const { IIKO_APP_ID, IIKO_API_KEY, IIKO_CLIENT_SECRET } = process.env;
  if (IIKO_APP_ID && IIKO_API_KEY && IIKO_CLIENT_SECRET) return { mode: 'app', appId: IIKO_APP_ID, apiKey: IIKO_API_KEY, clientSecret: IIKO_CLIENT_SECRET };
  throw new Error('Нет кредов iiko: задайте IIKO_API_LOGIN либо IIKO_APP_ID+IIKO_API_KEY+IIKO_CLIENT_SECRET');
}

function arg(name: string, def: string): string {
  const p = process.argv.find((a) => a.startsWith(`--${name}=`));
  return p ? p.split('=')[1] : def;
}

async function main() {
  const today = new Date().toISOString().slice(0, 10);
  const from = arg('from', '2026-02-01');
  const till = arg('till', today);
  const client = new IikoClient({ auth: authFromEnv() });
  const orgs = await client.getOrganizations();
  const orgId = process.env.IIKO_ORG_ID ?? orgs[0]?.id;
  if (!orgId) throw new Error('Не найдена организация iiko');

  if (process.argv.includes('--debug')) {
    console.log('организации:', JSON.stringify(orgs));
    console.log('orgId:', orgId, 'период:', from, '→', till);
    console.log('OLAP SALES columns:', JSON.stringify(await client.getOlapColumns()).slice(0, 1500));
    return;
  }

  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL }) });
  try {
    const summary = await importRevenue({
      fetchSales: (f, t) => client.getOlapSales(orgId, f, t),
      upsert: (pointId, date, amount) => upsertImportedRevenue(prisma, { pointId, date, amount }),
      pointId: POINT,
      from,
      till,
    });
    console.log(JSON.stringify({ orgId, from, till, ...summary }));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  console.error('import-iiko-revenue failed:', err);
  process.exit(1);
});
```
- [ ] **Step 2:** В `package.json` в `scripts` добавить после `import:statement`:
```json
    "import:iiko": "tsx scripts/import-iiko-revenue.mts",
```
- [ ] **Step 3:** `docs/iiko-import.md`:
```markdown
# Импорт выручки из iiko (iikoCloud OLAP)

Тянет дневную выручку Плюшкино (нетто после скидок) → таблица Revenue (point-1, source iiko),
идемпотентно по дню. Корица — отдельно, вручную.

## Авторизация (один из вариантов в ~/bakery-ops/.env)
- Простой apiLogin: `IIKO_API_LOGIN=...` (метод /api/1/access_token)
- Маркетплейс-приложение: `IIKO_APP_ID=...`, `IIKO_API_KEY=...`, `IIKO_CLIENT_SECRET=...` (метод /api/v2/access_token)
- Опц.: `IIKO_ORG_ID=...` (если организаций несколько; иначе берётся первая)

## Запуск
- Дискавери (организации + поля OLAP, без записи): `npm run import:iiko -- --debug`
- Бэкафилл/обновление: `npm run import:iiko -- --from=2026-02-01 --till=2026-06-08`
  (по умолчанию from=2026-02-01, till=сегодня). Идемпотентно.
- Вывод: `{ orgId, from, till, days, imported, updated }`.

## Финализация на первом прогоне
`--debug` печатает реальные колонки OLAP SALES — сверить с `OLAP_REVENUE_FIELD`/`OLAP_DATE_FIELD`
и формой ответа в `src/lib/iiko/client.ts` (помечено ADJUST), поправить при необходимости.
```
- [ ] **Step 4:** Проверка резолва под tsx (без живого доступа упадёт на сети/кредах, но импорты резолвятся):
Run: `cd /Users/nkola/bakery-ops && npx tsc --noEmit && env -u IIKO_API_LOGIN -u IIKO_APP_ID npx tsx scripts/import-iiko-revenue.mts --debug; echo "exit=$?"`
Expected: `tsc` без ошибок; запуск падает с «Нет кредов iiko…» (значит модули/импорты резолвятся), exit=1.
- [ ] **Step 5:** Commit `git add scripts/import-iiko-revenue.mts package.json docs/iiko-import.md && git commit -m "feat(iiko): CLI import-iiko-revenue (--from/--till/--debug) + шпаргалка"`

---

## Финальная проверка
- [ ] `cd /Users/nkola/bakery-ops && npx tsc --noEmit && npx eslint src && npm test` → всё зелёное (тесты iiko + существующие).
- [ ] Деплой не требуется до первого реального импорта; `RevenueSource.iiko` уже на Neon (Task 1). После появления рабочих кредов: `npm run import:iiko -- --debug` → финализировать поля OLAP → бэкафилл → (опц.) редеплой если читаем `source` где-то с типом enum.

## Зависимость от пользователя
Рабочие креды iiko (apiLogin с доступом к /api/1, либо appId+apiKey+clientSecret для v2) в `.env`. Сейчас ключ пользователя требует v2-набор — ожидается ответ iiko.

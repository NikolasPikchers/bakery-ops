# Страница «Ассортимент» — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** продажи по позициям из iiko сохраняются каждый день, страница `/assortment` показывает кандидатов на сокращение линейки и «что потеряю».

**Architecture:** новая таблица `DishSale` (день × блюдо iiko) пишется тем же ночным/кнопочным `runIikoSync`; чистое ядро `src/lib/assortment/` считает категории, статусы, ABC и метрики; серверная страница грузит строки за период и отдаёт клиентскому компоненту (фильтр, сортировка, галочки).

**Tech Stack:** Next.js 16 App Router, Prisma 7 + PostgreSQL (adapter-pg), Vitest.

**Spec:** `docs/superpowers/specs/2026-11-18-assortment-page-design.md`

## Global Constraints

- Только Плюшкино: `pointId = 'point-1'`.
- Ключ позиции — iiko `DishId`; имя — последнее из iiko.
- Выручка — `DishDiscountSumInt` (как в `Revenue`); себестоимость 0 = не заполнена.
- Служебное: `/пакет|стаканчик|упаковка|доп\.|сироп|соус/i` — не позиция линейки.
- Пороги: новинка — первая продажа позже `till − 60 дн.`; «не продаётся» — последняя продажа раньше `till − 13 дн.` (нет продаж 14 дней); ABC 80 / 95 %; «берут отдельно» — при ≥ 20 чеках.
- Периоды: 1 / 3 / 6 / 12 мес. = 30 / 91 / 182 / 365 дней по вчерашний день (МСК), по умолчанию 3.
- Схема в прод-базу попадает из приложения (`CREATE TABLE IF NOT EXISTS` при старте): Prisma migrate в проекте нет, база Timeweb с Mac недоступна.
- Секреты только в `.env*` (gitignored).

## Review Focus

- Блюдо пропало из дня (заказ удалён задним числом) → строка дня должна исчезнуть: замена дня целиком (тест в Task 2).
- Чек только с пакетом → не «покупка отдельно» ни для кого; чек «пицца + пакет» → пицца взята отдельно (тест в Task 1).
- Период, в котором iiko ещё нет истории (12 мес. при истории с января) → «в месяц» считается по дням периода, без деления на 0 при пустых данных (тест в Task 3).
- Позиция без продаж в предыдущие 30 дней → тренд `null`, не `Infinity` (тест в Task 3).
- Падение загрузки блюд не роняет выручку дня (тест в Task 2).

---

### Task 1: Продажи по блюдам из iiko

**Files:**
- Create: `src/lib/assortment/classify.ts`, `src/lib/assortment/classify.test.ts`
- Create: `src/lib/iiko/dish-sales.ts`, `src/lib/iiko/dish-sales.test.ts`
- Modify: `src/lib/iiko/client.ts` (метод `getDishSales`), `src/lib/iiko/types.ts`

**Interfaces — Produces:**
- `type DishSaleDay = { date: string; dishId: string; name: string; dishGroup: string | null; qty: number; revenue: number; cost: number; checks: number; soloChecks: number }` (types.ts)
- `isServiceDish(name: string): boolean`; `type DishCategory = 'savory' | 'sweet' | 'confectionery' | 'drinks' | 'order' | 'other'`; `dishCategory(name: string, group: string | null): DishCategory`; `displayName(name: string): string`; `CATEGORY_LABEL: Record<DishCategory, string>` (classify.ts)
- `aggregateDishSales(rows: Record<string, unknown>[]): DishSaleDay[]` — строки OLAP `OpenDate.Typed × UniqOrderId.Id × DishId × DishName × DishGroup` → «день × блюдо», по дате и dishId (dish-sales.ts)
- `IikoClient.getDishSales(from: string, till: string): Promise<DishSaleDay[]>` — отрезки `splitRange`, агрегаты `DishAmountInt`, `DishDiscountSumInt`, `ProductCostBase.ProductCost`, те же фильтры удалённых заказов, что у `getDailySales`.

- [ ] **Step 1: тесты classify** — `dishCategory('// Пицца куриная 154', 'Сытная мелкоштучка') === 'savory'`; `dishCategory('\\ Пончики на сметане 83', 'Сладкая мелкоштучка') === 'confectionery'` (префикс важнее группы); `'Сочень с творогом 73','Сладкая мелкоштучка' → 'sweet'`; `'Капучино 139','Кофе, чай, напитки, фри' → 'drinks'`; `'Лимонад 95','ЛПЗ' → 'drinks'`; `'Пирог Жульен (Заказной) 729','Заказные пироги' → 'order'`; `'ЧикенБургер 235', null → 'other'`; `isServiceDish('Пакет Майка 8р')`, `('Стаканчик 10р')`, `('Доп. Сироп (любой) 15р')` — true, `('Сосиска в тесте 86')` — false; `displayName('// Пицца куриная 154') === 'Пицца куриная 154'`, `displayName('\\ Эскимо 155') === 'Эскимо 155'`.
- [ ] **Step 2: тесты aggregateDishSales** — два чека за день: чек A = пицца ×2 (252 ₽, себест. 60) + пакет; чек B = пицца ×1 + чай. Ожидаем пицца `{qty: 3, revenue, cost, checks: 2, soloChecks: 1}`, чай `{checks: 1, soloChecks: 0}`, пакет `{checks: 1, soloChecks: 0}`; чек только с пакетом → у пакета soloChecks 0; пустая дата строки — пропуск; `ProductCostBase.ProductCost` отсутствует → cost 0; округление до копеек.
- [ ] **Step 3: run** `npx vitest run src/lib/assortment src/lib/iiko/dish-sales.test.ts` → FAIL (нет модулей).
- [ ] **Step 4: реализовать** classify.ts, dish-sales.ts, `getDishSales` (по образцу `getDailySales`).
- [ ] **Step 5: run** тот же набор → PASS; `npx tsc --noEmit` чисто.
- [ ] **Step 6: проверка на живом iiko** — скрипт из scratchpad сравнивает `getDishSales` и `getDailySales` за 2026-10-19..2026-11-17: суммы выручки по каждому дню совпадают до копейки.
- [ ] **Step 7: commit** `feat(assortment): продажи по блюдам из iiko`.

### Task 2: Таблица DishSale и запись при синхронизации

**Files:**
- Modify: `prisma/schema.prisma` (модель из спеки + `dishSales DishSale[]` у `Point`)
- Create: `src/lib/db/ensure-schema.ts`, `src/lib/db/ensure-schema.test.ts`
- Create: `src/lib/db/dish-sale-repo.ts`, `src/lib/db/dish-sale-repo.test.ts`
- Modify: `src/lib/iiko/sync.ts`, `src/lib/iiko/sync.test.ts`, `src/instrumentation.ts`, `src/app/api/cron/iiko-sync/route.ts` (+ тест роута), `scripts/import-iiko-revenue.mts` (подсказка в шапке)
- Move: `parseSyncRange` из `src/lib/tbank/sync-range.ts` в `src/lib/sync-range.ts` (tbank импортирует оттуда, `TBANK_MAX_DAYS` остаётся в tbank)

**Interfaces:**
- Consumes: `DishSaleDay`, `IikoClient.getDishSales` (Task 1).
- Produces:
  - `DISH_SALE_DDL: string[]` и `ensureDishSaleTable(db: { $executeRawUnsafe(sql: string): Promise<unknown> }): Promise<void>` — DDL совпадает с моделью Prisma (имена колонок в кавычках, `DECIMAL(12,3)` / `(12,2)`, уникальный индекс `DishSale_pointId_date_dishId_key`, индекс `DishSale_pointId_date_idx`, FK на `Point`).
  - `replaceDishSales(prisma, pointId: string, from: string, till: string, rows: DishSaleDay[]): Promise<number>` — в `$transaction`: `deleteMany` дат `[from; till]` + `createMany`; возвращает число строк.
  - `loadDishSales(prisma, pointId: string, from: string, till: string): Promise<DishSaleDay[]>`; `loadDishSpans(prisma, pointId: string): Promise<Map<string, { first: string; last: string }>>` (`groupBy dishId` min/max date).
  - `IikoSalesSource` += `'getDishSales'`; `syncIikoRevenue` deps += `replaceDishes?: (pointId, from, till, rows) => Promise<number>`; `IikoSyncSummary` += `dishes?: { rows: number } | { error: string }`.

- [ ] **Step 1: тесты** — (a) `ensureDishSaleTable` выполняет все `DISH_SALE_DDL`, каждый — `IF NOT EXISTS`; DDL содержит колонки `"dishId"`, `"soloChecks"`, `"cost"`. (b) `replaceDishSales` на фейковой Prisma: удаляет даты периода и вставляет строки с `pointId` (как в `expense-import-repo.test.ts`). (c) `syncIikoRevenue` с `replaceDishes`: вызывает `getDishSales(from, till)` и `replaceDishes('point-1', from, till, rows)`; сводка `dishes: { rows: 2 }`. (d) `getDishSales` бросает → выручка записана, `dishes: { error: 'iiko down' }`, функция не бросает. (e) cron-роут: `?from=2026-01-01&till=2026-11-17` → `runIikoSync` с этим периодом; `?from=2026-11-17&till=2026-01-01` → 400; без параметров — `syncWindow`; лимит 366 дней.
- [ ] **Step 2: run** → FAIL.
- [ ] **Step 3: реализовать.** `runIikoSync` передаёт `replaceDishes` через `replaceDishSales(prisma, …)`. В `instrumentation.ts` перед планировщиком (всегда в nodejs-рантайме): `await ensureDishSaleTable(getPrisma())` в try/catch с `console.error('DishSale schema:', …)` — ошибка схемы не роняет старт. `npx prisma generate`.
- [ ] **Step 4: run** `npm test` → PASS; `npx tsc --noEmit`; `npx eslint src`.
- [ ] **Step 5: commit** `feat(assortment): таблица DishSale, запись при синхронизации iiko, период в cron`.

### Task 3: Ядро аналитики ассортимента

**Files:**
- Create: `src/lib/assortment/analyze.ts`, `src/lib/assortment/analyze.test.ts`, `src/lib/assortment/period.ts`, `src/lib/assortment/period.test.ts`

**Interfaces:**
- Consumes: `DishSaleDay`, `dishCategory`, `isServiceDish`, `displayName` (Task 1).
- Produces:
  - `type PeriodMonths = 1 | 3 | 6 | 12`; `parseMonths(raw: string | undefined): PeriodMonths` (по умолчанию 3); `assortmentPeriod(months: PeriodMonths, now: Date): { from: string; till: string }` — till = вчера по МСК (`todayMoscow` − 1), длина 30/91/182/365 дней; `loadWindowFrom(from: string, till: string): string` = min(from, till − 59) — с какой даты грузить строки ради тренда.
  - `type ItemStatus = 'active' | 'new' | 'stopped' | 'order'`; `type AbcClass = 'A' | 'B' | 'C'`
  - `type AssortmentItem = { dishId; name; category: DishCategory; status: ItemStatus; abc: AbcClass | null; revenue; perMonth; share; qty; daysSold; qtyPerSoldDay; trend: number | null; weekly: number[]; checks; soloChecks; soloShare: number | null; markup: number | null; firstSale: string; lastSale: string }`
  - `type AssortmentView = { from; till; periodDays; openDays; totalRevenue; items: AssortmentItem[]; counts: { onSale; A; B; C; new; stopped }; abcShare: { A; B; C } }`
  - `analyzeAssortment(input: { rows: DishSaleDay[]; spans: Map<string, { first: string; last: string }>; from: string; till: string }): AssortmentView` — `items` по убыванию выручки, только позиции с выручкой в периоде, без служебного.
  - `selectionSummary(items: AssortmentItem[], ids: Set<string>, totalRevenue: number): { count; perMonth; share; soloShare: number | null }`

ABC (не выводится из сигнатуры): среди `status === 'active'` по убыванию выручки; позиция — A, пока накопленная доля **до** неё < 0,80; B, пока < 0,95; иначе C. Доли `share`/`abcShare` — от `totalRevenue` (всё не служебное в периоде).

- [ ] **Step 1: тесты period** — `assortmentPeriod(3, new Date('2026-11-18T10:00:00+03:00'))` → `{ from: '2026-08-18', till: '2026-11-17' }`; `(1, …)` → `from '2026-10-19'`; после полуночи МСК (`2026-11-18T22:30:00Z`) till = `'2026-11-18'`; `parseMonths('6') === 6`, `parseMonths('7') === 3`, `parseMonths(undefined) === 3`; `loadWindowFrom('2026-11-01','2026-11-17') === '2026-09-19'`.
- [ ] **Step 2: тесты analyze** на кейсах из спеки: «Курочка по-корейски» с первой продажей 2026-10-04 при till 2026-11-17 → `new`, `abc null`; «Лимонад» с последней продажей 2026-11-02 → `stopped`; заказной пирог → `order`; пакет не попадает в `items` и в `totalRevenue`; 10 активных позиций с выручкой 50/20/10/8/5/3/2/1/0,5/0,5 → классы A,A,B,B,C… (A: 50,20,10 — до 10 накоплено 0,70 < 0,8 → A; 8 — до неё 0,80 → B; 5 — 0,88 → B; 3 — 0,93 → B; 2 — 0,96 → C …); трайфл 9 дней × 2,6 шт. → `daysSold 9`, `qtyPerSoldDay 2.6`; тренд: 3000 ₽ за последние 30 дней к 2000 ₽ за предыдущие → 50; без продаж в предыдущие 30 → `null`; `soloShare` при 19 чеках → `null`, при 20 чеках и 5 отдельно → 25; `markup`: выручка 252, себест. 60 во всех днях → 320; хотя бы один день продаж с cost 0 → `null`; `perMonth` = revenue / periodDays × 30; пустые `rows` → `items: []`, `totalRevenue 0`, без NaN; `counts.onSale` — не служебные с last ≥ till − 13; `selectionSummary` по двум позициям: сумма perMonth, share = сумма revenue / totalRevenue × 100, soloShare по суммам чеков.
- [ ] **Step 3: run** `npx vitest run src/lib/assortment` → FAIL.
- [ ] **Step 4: реализовать** analyze.ts, period.ts.
- [ ] **Step 5: run** → PASS; `npx tsc --noEmit`.
- [ ] **Step 6: сверка с разведкой** — на истории из iiko (scratchpad) за 2026-08-18..2026-11-17: активных ~87, C ~21 позиция ~5 % выручки, «Курочка по-корейски» — новинка, «Лимонад» — не продаётся.
- [ ] **Step 7: commit** `feat(assortment): ядро — категории, статусы, ABC, метрики`.

### Task 4: Страница «Ассортимент» и карточка на дашборде

**Files:**
- Create: `src/app/assortment/page.tsx` (server), `src/app/assortment/AssortmentClient.tsx` (client), `src/app/assortment/assortment-page.test.ts`
- Modify: `src/app/AppShell.tsx` (пункт `{ href: '/assortment', label: 'Ассортимент' }` после «Разбивки»), `src/app/page.tsx` (карточка), `AGENTS.md`, `docs/iiko-import.md`

**Interfaces:**
- Consumes: `assortmentPeriod`, `parseMonths`, `loadWindowFrom`, `analyzeAssortment`, `selectionSummary`, `CATEGORY_LABEL` (Task 3, 1); `loadDishSales`, `loadDishSpans` (Task 2); `PageHeader`, `Card`, `CardHead`, `Kpi`, `Empty`, `kpiGridStyle`, `numStyle`, `headRowStyle`, `rowStyle` из `_ui.tsx`; `Sparkline` из `_charts.tsx`.
- Produces: `AssortmentClient({ view }: { view: AssortmentView })`; `lossMessage(s: ReturnType<typeof selectionSummary>): string`.

Тексты: заголовок «Ассортимент», подзаголовок «Плюшкино · продажи по позициям из iiko»; переключатель периода — ссылки `?months=1|3|6|12` с подписями «1 мес», «3 мес», «6 мес», «12 мес»; чипы «Все» + `CATEGORY_LABEL`; KPI «В продаже», «A · % выручки», «B», «C — кандидаты», «Новинки»; блоки «Кандидаты на сокращение» (класс C), «Все позиции», «Новинки», «Уже не продаются» (с датой последней продажи); колонки: позиция, класс, ₽/мес, доля, дней в продаже «N из M», шт. в день продажи, тренд, по неделям, отдельно, наценка; пустая таблица DishSale → `Empty`: «Продаж по позициям ещё нет — они появятся после ночной загрузки из iiko». Плашка при отмеченных позициях: `lossMessage` → «Отмечено 5 позиций: 14 200 ₽/мес — 0,8% выручки · отдельно их брали в 6% чеков» (без «отдельно…», если soloShare null). Карточка дашборда: «Ассортимент · в продаже N · кандидатов на сокращение M (X% выручки) →» ссылкой на `/assortment`; без данных — не показывать.

- [ ] **Step 1: тест** — `renderToStaticMarkup(createElement(AssortmentClient, { view }))` на маленьком view: есть «Кандидаты на сокращение», имя C-позиции, «2 из 3»; `lossMessage` даёт строку выше для `{count: 5, perMonth: 14200, share: 0.8, soloShare: 6}` и без хвоста при `soloShare: null`.
- [ ] **Step 2: run** → FAIL. **Step 3:** реализовать. **Step 4:** `npm test`, `npx tsc --noEmit`, `npx eslint src` → PASS.
- [ ] **Step 5: локально на живых данных** — временный Postgres в Docker, `prisma db push`, `npm run import:iiko -- --from=2026-01-01 --till=<вчера>`, dev-сервер, страница в браузере на ширине телефона и десктопа: числа сходятся с Task 3 Step 6, галочки считают потерю.
- [ ] **Step 6: commit** `feat(assortment): страница «Ассортимент» и карточка на дашборде`.

### Task 5: Выкатка и история на проде

- [ ] **Step 1:** push + деплой на Timeweb (`tw-deploy.sh`), `/api/health` отдаёт новую ревизию, в логе старта нет `DishSale schema:` ошибки.
- [ ] **Step 2:** `GET /api/cron/iiko-sync?from=2026-01-01&till=<вчера>` с `CRON_SECRET` → `dishes.rows` ≈ 22 тыс.
- [ ] **Step 3:** страница на проде за 3 мес — те же числа, что локально.

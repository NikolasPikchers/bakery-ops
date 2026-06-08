# Bakery Ops — Фаза 3: импорт выручки из iiko (iikoCloud OLAP), v1

**Дата:** 2026-06-08
**Статус:** design approved → план
**Контекст:** Nikas Cafe. Касса — iiko (выручка), расходы — Т-Бизнес (Фаза 2, импортируются из выписки). Цель Фазы 3 — автоматически подтягивать выручку из iiko, чтобы дашборд считал чистую прибыль (выручка iiko − расходы Т-Бизнес) без ручного ввода выручки.

## Цель

Тянуть дневную выручку точки **Плюшкино** из iikoCloud (OLAP-отчёт SALES) → таблица `Revenue` (идемпотентно, unique `pointId_date`) → дашборд показывает чистую прибыль.

## Бизнес-контекст

- **iiko стоит только на Плюшкино** (point-1). Тянем выручку Плюшкино из iiko.
- **Корица** (point-2) в iiko нет — присылает недельную сумму продаж вручную; остаётся ручным вводом (`source: manual`), вне области Фазы 3.
- iikoCloud API (`api-ru.iiko.services`) **достижим с Mac Mini** (проверено: `access_token` отвечает 401 на плохой логин = доступен, не гео-блокирован) — делаем настоящую API-интеграцию.

## Область v1

Импорт дневной чистой выручки Плюшкино из iikoCloud OLAP SALES, идемпотентно, с бэкафиллом истории (с 2026-02-01, чтобы совпасть с периодом расходов) и возможностью ежедневного прогона.

## Вне области v1 (отложено)

- Выручка Корицы (остаётся ручной недельной суммой).
- Мультиточечность iiko, реал-тайм/вебхуки, любые иные данные iiko (чеки, номенклатура, себестоимость).
- UI ручной правки выручки (уже есть на странице Финансы).

## Подход

**iikoCloud OLAP-отчёт SALES** через `api-ru.iiko.services`. Альтернативы отклонены: iikoServer (resto) OLAP требует доступа к локальному серверу (у заведения облако); файловый импорт не нужен, т.к. API достижим.

## Архитектура и компоненты

### 1. `src/lib/iiko/client.ts` — клиент iikoCloud (изолированный)
- `access_token`: `POST /api/1/access_token { apiLogin }` → токен (~60 мин). Кэшируется в пределах одного прогона (одного процесса), межзапускового хранения не требуется.
- `getOrganizations(): Promise<IikoOrg[]>` — `POST /api/1/organizations`.
- `getOlapSales(orgId, from, till): Promise<DailyRevenue[]>` — `POST /api/1/reports/olap` с `reportType: "SALES"`, агрегат чистой выручки (после скидок), группировка по дню, фильтр по диапазону дат и организации. Возвращает `[{ date: 'YYYY-MM-DD', amount: number }]`.
- **Единственное место** с host, путями и именами полей OLAP. Точные имена (`DishDiscountSumInt`, `OpenDate.Typed` и форма ответа) финализируются на первом реальном вызове через `POST /api/1/reports/olap/columns/SALES` (дискавери полей) — помечено `ADJUST`.
- HTTP с авторизацией `Bearer ${token}`, явный timeout; не-2xx → throw (без тихих фолбэков).
- Типы:
  ```ts
  type IikoOrg = { id: string; name: string };
  type DailyRevenue = { date: string; amount: number }; // ISO день, ₽ (нетто после скидок)
  ```

### 2. `src/lib/iiko/import-revenue.ts` — оркестратор
- Вход: `fetchSales(from, till) => Promise<DailyRevenue[]>`, `upsert(pointId, date, amount) => Promise<'imported'|'updated'>`, `pointId`, `from`, `till`.
- Шаги: получить дневную выручку → для каждого дня **идемпотентный upsert** в `Revenue` (по `pointId_date`).
- Возвращает `{ days, imported, updated }`.
- Инъекция зависимостей → тестируется без сети и БД.

### 3. Репозиторий
- Переиспользуем существующий `upsertRevenue(prisma, { pointId, date, amount, source })` из `src/lib/db/finance-repo.ts` (уже идемпотентен по `pointId_date`).
- Источник: `source: 'iiko'`.

### 4. Миграция схемы
- `enum RevenueSource { manual import iiko }` — добавить `iiko`. DDL на `DATABASE_URL_UNPOOLED`.

### 5. Коллектор + (опц.) launchd
- `scripts/import-iiko-revenue.mts` — точка входа: грузит `.env`, берёт `IIKO_API_LOGIN`, создаёт `PrismaClient` (driver adapter), вызывает оркестратор, печатает сводку.
  - Диапазон: по умолчанию `--from 2026-02-01 --till сегодня`; флаги `--from`/`--till`.
  - `--debug`: печатает организации и колонки OLAP SALES (для финализации маппинга), без записи.
- API достижим с Mac Mini → можно повесить на launchd (ежедневно, напр. 05:00) + ручной запуск `npm run import:iiko`.
- Env: `IIKO_API_LOGIN`, `DATABASE_URL` (+ `DATABASE_URL_UNPOOLED` для миграций), опц. `IIKO_ORG_ID` (если организаций несколько — иначе берём первую).

## Поток данных

```
launchd / ручной запуск (Mac Mini)
  └─ import-iiko-revenue.mts (--from --till)
       └─ import-revenue(fetchSales, upsert, point-1, from, till)
            ├─ iiko.client.getAccessToken(IIKO_API_LOGIN)   [POST /api/1/access_token]
            ├─ iiko.client.getOrganizations()               [→ orgId Плюшкино]
            ├─ iiko.client.getOlapSales(orgId, from, till)  [POST /api/1/reports/olap, SALES, по дням]
            └─ upsertRevenue(point-1, date, amount, 'iiko')  [Neon, unique pointId_date]
  ⇒ дашборд (Vercel) читает Revenue → чистая прибыль = выручка iiko − расходы Т-Бизнес
```

## Обработка ошибок

- Нет `IIKO_API_LOGIN` → коллектор падает с понятной ошибкой (не тихо).
- Ошибка авторизации / не-2xx / таймаут → throw, ненулевой exit-код; следующий прогон подхватит диапазон заново (идемпотентно).
- Пустой OLAP (нет продаж за день) → день пропускается; сводка с нулями возможна, exit 0.
- Организация не найдена / их несколько без `IIKO_ORG_ID` → понятная ошибка.

## Тестирование

- `client` маппинг — тест на синтетическом ответе OLAP (форма `{ data: [{ OpenDate.Typed, DishDiscountSumInt }] }` или фактическая) → `[{date, amount}]`; инъекция `fetch`.
- `import-revenue` — тест с фейковыми `fetchSales`/`upsert`: суммирование по дням, идемпотентность (повторный прогон → updated).
- Существующие тесты финансов/дашборда не ломаются (`source: 'iiko'` проходит как выручка).

## Валидация на первом реальном прогоне

После появления `IIKO_API_LOGIN` в `.env`: `npm run import:iiko -- --debug` печатает организации и колонки OLAP SALES → финализируем имена полей/форму ответа в `client.ts` → полный прогон с бэкафиллом. Точные имена полей OLAP — единственная внешняя неизвестность, изолирована в `client.ts`.

## Открытые вопросы (на потом, не блокируют v1)

1. Автоматизация/расписание Корицы (сейчас ручная недельная сумма).
2. Расширение iiko: себестоимость/номенклатура (Фаза 4 — склад/себестоимость).
3. Сверка выручки iiko с поступлениями СБП в выписке Т-Бизнес (контроль расхождений).

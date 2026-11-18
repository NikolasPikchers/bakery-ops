# Выручка из iiko (iikoCloud API, OLAP)

Дневная выручка Плюшкино (сумма со скидкой) и её часть по кондитерке (блюда с префиксом «\») →
таблица `Revenue` (point-1, `source: iiko`), идемпотентно по дню. Корица — вручную.
Сверено 17.11.2026: за 1–16 ноября суммы до копейки совпали с xlsx-выгрузками.

Тем же прогоном — **продажи по позициям** → `DishSale` (день × блюдо iiko: штуки, выручка,
себестоимость, чеки и чеки, где позиция куплена одна) для страницы «Ассортимент». Дни периода
заменяются целиком. Сумма `DishSale.revenue` за день = `Revenue.amount` (сверено 18.11.2026 на всей
истории с 03.01.2026 — 313 дней, расхождений нет). Сбой загрузки позиций не мешает выручке — ошибка
видна в ответе (`dishes.error`) и в логе `iiko dish sales failed`. Таблицу создаёт само приложение
при старте (`src/lib/db/ensure-schema.ts`, «если нет»).

## Ключи (в `.env` локально и в env проекта на Vercel)
- `IIKO_APP_ID`, `IIKO_CLIENT_SECRET` — приложение типа server-to-server на портале разработчика
  https://api.iiko.help («Мои приложения»). Секрет показывают один раз; потерян — сбросить в карточке.
- `IIKO_API_KEY` — ключ организации из iikoWeb (раньше назывался apiLogin). Должен видеть ровно
  одну организацию — Плюшкино: OLAP не фильтруется по организации, второй ресторан смешал бы выручку,
  поэтому синхронизация в этом случае падает с ошибкой.
- `CRON_SECRET` — только на Vercel: им Vercel Cron подписывает вызов `/api/cron/iiko-sync`.

Токен: `POST https://api-ru.iiko.services/api/v2/access_token { appId, apiKey, clientSecret }` (живёт час).
Старый `/api/1/access_token` для такого ключа отвечает 403 «use /api/v2/access_token».

## Как обновляется
- **Ночью** — планировщик приложения на Timeweb в 04:00 МСК (`IIKO_SCHEDULER_ENABLED=1`): вчера и сегодня по Москве.
- **История по CRON_SECRET** — `GET /api/cron/iiko-sync?from=2026-01-01&till=2026-11-17` (до 366 дней,
  режется по 31 дню): так грузится история позиций на проде.
- **Днём** — при открытии дашборда (`IikoAutoSync`) и кнопкой «Обновить из iiko» на странице «Выручка»
  (там же — свой период до 31 дня). Оба ходят в `POST /api/revenue/iiko-sync` (только владелец).
- Выгрузка xlsx на странице «Выручка» осталась запасным путём.

## CLI
- Вчера и сегодня: `npm run import:iiko`
- История: `npm run import:iiko -- --from=2026-02-01 --till=2026-06-08` (режется по 31 дню — лимит iiko),
  вместе с продажами по позициям
- Организации и поля OLAP, без записи: `npm run import:iiko -- --debug`

## OLAP
`POST /api/reporting/v1/olap/get`: `reportType: SALES`, строки `OpenDate.Typed` × `DishName`,
агрегат `DishDiscountSumInt` («Сумма со скидкой»), фильтры — массивом: `DateRange` по `OpenDate.Typed`
(CUSTOM, не больше 31 дня), `OrderDeleted` и `DeletedWithWriteoff` = `NOT_DELETED`.
Набор полей iiko меняет между версиями — при ошибках сверить с `--debug`
(`/api/reporting/v1/olap/columns/get`). Всё это — в `src/lib/iiko/client.ts`.

Позиции — тот же запрос с разрезом `OpenDate.Typed × UniqOrderId.Id × DishId × DishName × DishGroup`
и агрегатами `DishAmountInt`, `DishDiscountSumInt`, `ProductCostBase.ProductCost`; свёртка чеков —
`src/lib/iiko/dish-sales.ts`. `DishId` устойчив к переименованию (iiko отдаёт текущее имя).
Себестоимость заполнена не у всех блюд (у кондитерки — 0) — наценка показывается только где она есть.

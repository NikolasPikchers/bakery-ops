# Bakery Ops — заметки для агентов

Сервис управления пекарней (2 точки). Касса — iiko, денежные расходы — Т-Бизнес, движение товара — на бумаге.

## Что это и зачем
Главная задача: оцифровать рукописные листы движения товара (Приход / Остаток / Списание по каждой
позиции, дате, точке) → реестр → дашборд остатков, продаж, списаний; плюс aging для десертов Точки 2
(подсветка позиций, лежащих > N дней).

## Документы (читать перед работой)
- Спека Фазы 1: `docs/superpowers/specs/2026-06-07-bakery-ops-phase1-design.md`
- План реализации (Plan 1, Foundation): `docs/superpowers/plans/2026-06-07-bakery-ops-phase1-foundation.md`
- Фазы дальше: Ф2 — Т-Бизнес API; Ф3 — iiko Cloud API; Ф4 — склад/себестоимость.

## Стек
Next.js (App Router, TypeScript, `src/`, alias `@/*`) · Vitest · Prisma + PostgreSQL (Prisma 7:
URL датасорса в `prisma.config.ts`, не в `schema.prisma`) · далее Vercel + Neon + Telegram + Anthropic vision + NextAuth.

## Где что
- `src/lib/domain/` — чистое доменное ядро (без БД/IO):
  - `types.ts` — `ParsedQuantity`, `SheetType`, `PointScope`
  - `parseQuantity.ts` — разбор рукописных ячеек («24+12+6», «13-1», «=N», кружок ⑨, единицы→ambiguous). `value` авторитетен; `parts` без знака.
  - `computeSold.ts` — продано = вчер.остаток + приход − списание − остаток
  - `aging.ts` — возраст остатка = дней с последнего прихода, пока остаток > 0; stale при возрасте > порога
- `src/lib/catalog/seed-catalog.ts` — стартовый каталог SKU с реальных листов
- `prisma/schema.prisma` — Point, Product, Sheet, Movement, UnknownLine (+ enums)

## Команды
- Тесты: `npm test` (Vitest, `passWithNoTests`)
- Схема: `npx prisma validate` / `npx prisma generate` (миграции — в плане данных)
- Типы: `npx tsc --noEmit` · Линт: `npx eslint src/lib`

## Конвенции
- TDD: падающий тест → реализация → зелёный → коммит. Тесты на реальных кейсах с листов.
- Секреты только в `.env` (gitignored), не в коммитах.

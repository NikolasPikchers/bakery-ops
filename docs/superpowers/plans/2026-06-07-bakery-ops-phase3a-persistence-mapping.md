# Bakery Ops — Phase 1, Plan 3a: Слой данных (маппинг распознавания в записи БД)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Превратить `RecognitionResult` (выход Plan 2) в готовые к записи структуры `Sheet` / `Movement` / `UnknownLine`, с вычислением `soldCalc` (через `computeSold` из Plan 1) внутри листа и SHA-256 хэшем фото для дедупа. Всё — чистые функции, тестируются офлайн без БД.

**Architecture:** Чистый слой `src/lib/persistence/` без сети и без Prisma. `recognitionToRecords` детерминированно строит записи; `computeImageHash` даёт стабильный ключ дедупа. Реальная запись в Postgres (Prisma-репозитории, миграция, оркестратор `persistRecognition`) — Plan 3b (требует `DATABASE_URL`).

**Tech Stack:** TypeScript, `node:crypto` (sha256), Vitest. Опирается на Plan 1 (`computeSold`, `SheetType`, `ParsedQuantity`) и Plan 2 (`RecognitionResult`). Ветка: `phase3a-persistence` (от `phase2-recognition`).

**Покрытие спеки:** §5 (запись в модель данных), §8 (`soldCalc` внутри листа), §12 (статус `needs_review` при неуверенности/несопоставлении/`unknownLines`; дедуп по хэшу — ключ готовим здесь, применяет 3b).

---

### Task 1: SHA-256 хэш фото (ключ дедупа)

**Files:**
- Create: `src/lib/persistence/image-hash.ts`
- Test: `src/lib/persistence/image-hash.test.ts`

- [ ] **Step 1: Написать падающий тест `src/lib/persistence/image-hash.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { computeImageHash } from './image-hash';

describe('computeImageHash', () => {
  it('SHA-256 hex от известного входа', () => {
    expect(computeImageHash(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('детерминирован и различает разные входы', () => {
    const a = computeImageHash(Buffer.from('photo-1'));
    const b = computeImageHash(Buffer.from('photo-1'));
    const c = computeImageHash(Buffer.from('photo-2'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/persistence/image-hash.test.ts`
Expected: FAIL (Cannot find module './image-hash')

- [ ] **Step 3: Реализовать `src/lib/persistence/image-hash.ts`**

```ts
import { createHash } from 'node:crypto';

/** Стабильный SHA-256 (hex) от байтов изображения — ключ дедупа загруженных листов. */
export function computeImageHash(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/persistence/image-hash.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
cd /Users/nkola/bakery-ops
git add src/lib/persistence/image-hash.ts src/lib/persistence/image-hash.test.ts
git commit -m "feat(persistence): computeImageHash — SHA-256 ключ дедупа листов"
```

---

### Task 2: `recognitionToRecords` — маппинг в записи БД

Строит `Sheet` (со статусом `recognized`/`needs_review`), `Movement[]` (только по сопоставленным строкам, с `soldCalc` внутри листа) и `UnknownLine[]`. Несопоставленные строки в `Movement` НЕ попадают (нужно ручное сопоставление) — они доступны ревью-UI через `rawRecognition` в `Sheet`.

**Files:**
- Create: `src/lib/persistence/recognition-to-records.ts`
- Test: `src/lib/persistence/recognition-to-records.test.ts`

- [ ] **Step 1: Написать падающий тест `src/lib/persistence/recognition-to-records.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { recognitionToRecords, type PersistContext } from './recognition-to-records';
import type { RecognitionResult } from '@/lib/recognition/schema';
import type { ParsedQuantity } from '@/lib/domain/types';

const q = (value: number | null, raw: string): ParsedQuantity => ({
  value, raw, parts: value === null ? [] : [value], ambiguous: false,
});

const ctx: PersistContext = {
  pointId: 'pt1', sheetId: 'sh1', imageUrl: 'blob://x', imageHash: 'abc',
  source: 'telegram', uploadedBy: null,
};

const result: RecognitionResult = {
  pointHint: 'Точка 1',
  sheetType: 'pies',
  dates: ['2026-06-05', '2026-06-06'],
  rows: [
    {
      productName: 'Пицца открытая',
      matchedProductId: 'p16',
      matchConfidence: 1,
      cells: [
        { date: '2026-06-05', prihod: q(34, '24+10'), ostatok: q(5, '5'), spisanie: q(null, '') },
        { date: '2026-06-06', prihod: q(42, '24+12+6'), ostatok: q(1, '4-3'), spisanie: q(null, '') },
      ],
    },
    {
      productName: 'Неведомая',
      matchedProductId: null,
      matchConfidence: 0,
      cells: [{ date: '2026-06-06', prihod: q(5, '5'), ostatok: q(null, ''), spisanie: q(null, '') }],
    },
  ],
  unknownLines: [{ rawText: 'тесто 3кг', note: null }],
  warnings: [],
};

describe('recognitionToRecords', () => {
  it('строит Sheet со статусом needs_review (есть несопоставленная строка и unknownLines)', () => {
    const recs = recognitionToRecords(result, ctx);
    expect(recs.sheet).toMatchObject({
      id: 'sh1', pointId: 'pt1', sheetType: 'pies', imageHash: 'abc',
      source: 'telegram', status: 'needs_review',
    });
    expect(recs.sheet.dates).toEqual(['2026-06-05', '2026-06-06']);
    expect(recs.sheet.rawRecognition).toBe(result);
  });

  it('movements только по сопоставленным строкам; soldCalc внутри листа', () => {
    const recs = recognitionToRecords(result, ctx);
    expect(recs.movements).toHaveLength(2); // только Пицца открытая (2 даты)
    const [d5, d6] = recs.movements;
    expect(d5).toMatchObject({ productId: 'p16', date: '2026-06-05', prihod: 34, ostatok: 5, soldCalc: null });
    expect(d6).toMatchObject({ productId: 'p16', date: '2026-06-06', prihod: 42, ostatok: 1, soldCalc: 46 });
    expect(d6.rawCell).toEqual({ prihod: '24+12+6', ostatok: '4-3', spisanie: '' });
    expect(d6.confidence).toBe(1);
    expect(d6.manuallyEdited).toBe(false);
  });

  it('unknownLines переносятся со статусом pending', () => {
    const recs = recognitionToRecords(result, ctx);
    expect(recs.unknownLines).toEqual([
      { sheetId: 'sh1', pointId: 'pt1', date: null, rawText: 'тесто 3кг', parsedNumbers: null, status: 'pending' },
    ]);
  });

  it('статус recognized, когда всё сопоставлено, без ambiguous и без unknownLines', () => {
    const clean: RecognitionResult = {
      pointHint: null, sheetType: 'pies', dates: ['2026-06-06'],
      rows: [{
        productName: 'Самса', matchedProductId: 'p5', matchConfidence: 1,
        cells: [{ date: '2026-06-06', prihod: q(8, '8'), ostatok: q(9, '9'), spisanie: q(null, '') }],
      }],
      unknownLines: [], warnings: [],
    };
    expect(recognitionToRecords(clean, ctx).sheet.status).toBe('recognized');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/persistence/recognition-to-records.test.ts`
Expected: FAIL (Cannot find module './recognition-to-records')

- [ ] **Step 3: Реализовать `src/lib/persistence/recognition-to-records.ts`**

```ts
import { computeSold } from '@/lib/domain/computeSold';
import type { SheetType } from '@/lib/domain/types';
import type { RecognitionResult, RecognizedRow } from '@/lib/recognition/schema';

export type PersistContext = {
  pointId: string;
  sheetId: string;
  imageUrl: string;
  imageHash: string;
  source: 'telegram' | 'web';
  uploadedBy?: string | null;
};

export type SheetRecord = {
  id: string;
  pointId: string;
  sheetType: SheetType;
  imageUrl: string;
  imageHash: string;
  dates: string[];
  source: 'telegram' | 'web';
  uploadedBy: string | null;
  status: 'recognized' | 'needs_review';
  rawRecognition: RecognitionResult;
};

export type MovementRecord = {
  pointId: string;
  productId: string;
  date: string;
  prihod: number | null;
  ostatok: number | null;
  spisanie: number | null;
  soldCalc: number | null;
  sheetId: string;
  confidence: number;
  rawCell: { prihod: string; ostatok: string; spisanie: string };
  manuallyEdited: false;
};

export type UnknownLineRecord = {
  sheetId: string;
  pointId: string;
  date: string | null;
  rawText: string;
  parsedNumbers: null;
  status: 'pending';
};

export type RecognitionRecords = {
  sheet: SheetRecord;
  movements: MovementRecord[];
  unknownLines: UnknownLineRecord[];
};

function rowHasAmbiguousCell(row: RecognizedRow): boolean {
  return row.cells.some(
    (c) => c.prihod.ambiguous || c.ostatok.ambiguous || c.spisanie.ambiguous,
  );
}

function movementsForRow(row: RecognizedRow, ctx: PersistContext): MovementRecord[] {
  if (row.matchedProductId === null) return [];
  const cells = [...row.cells].sort((a, b) => a.date.localeCompare(b.date));
  return cells.map((cell, i) => {
    const prevOstatok = i > 0 ? cells[i - 1].ostatok.value : null;
    const { sold } = computeSold({
      prevOstatok,
      prihod: cell.prihod.value,
      spisanie: cell.spisanie.value,
      ostatok: cell.ostatok.value,
    });
    return {
      pointId: ctx.pointId,
      productId: row.matchedProductId as string,
      date: cell.date,
      prihod: cell.prihod.value,
      ostatok: cell.ostatok.value,
      spisanie: cell.spisanie.value,
      soldCalc: sold,
      sheetId: ctx.sheetId,
      confidence: row.matchConfidence,
      rawCell: { prihod: cell.prihod.raw, ostatok: cell.ostatok.raw, spisanie: cell.spisanie.raw },
      manuallyEdited: false,
    };
  });
}

export function recognitionToRecords(
  result: RecognitionResult,
  ctx: PersistContext,
): RecognitionRecords {
  const needsReview =
    result.unknownLines.length > 0 ||
    result.rows.some((r) => r.matchedProductId === null) ||
    result.rows.some(rowHasAmbiguousCell);

  const sheet: SheetRecord = {
    id: ctx.sheetId,
    pointId: ctx.pointId,
    sheetType: result.sheetType,
    imageUrl: ctx.imageUrl,
    imageHash: ctx.imageHash,
    dates: result.dates,
    source: ctx.source,
    uploadedBy: ctx.uploadedBy ?? null,
    status: needsReview ? 'needs_review' : 'recognized',
    rawRecognition: result,
  };

  const movements = result.rows.flatMap((row) => movementsForRow(row, ctx));

  const unknownLines: UnknownLineRecord[] = result.unknownLines.map((u) => ({
    sheetId: ctx.sheetId,
    pointId: ctx.pointId,
    date: null,
    rawText: u.rawText,
    parsedNumbers: null,
    status: 'pending',
  }));

  return { sheet, movements, unknownLines };
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/persistence/recognition-to-records.test.ts`
Expected: PASS (4 кейса)

- [ ] **Step 5: Прогнать весь набор + типы**

Run: `cd /Users/nkola/bakery-ops && npm test && npx tsc --noEmit`
Expected: всё PASS, tsc чисто.

- [ ] **Step 6: Коммит**

```bash
cd /Users/nkola/bakery-ops
git add src/lib/persistence/recognition-to-records.ts src/lib/persistence/recognition-to-records.test.ts
git commit -m "feat(persistence): recognitionToRecords — маппинг в Sheet/Movement/UnknownLine + soldCalc"
```

---

## Заметки для 3b (персистентность + захват)

- **Дедуп:** `computeImageHash(bytes)` → искать `Sheet` с тем же `imageHash`; при совпадении — не плодить, а обновлять/переоткрывать на ревью.
- **Кросс-листовой `soldCalc`:** здесь считается остаток-в-пределах-листа. Перенос «вчерашнего остатка из БД» (когда новый лист продолжает предыдущий день) — задача репозитория в 3b (подтянуть прошлый `Movement.ostatok` как `prevOstatok`).
- **Несопоставленные строки** (`matchedProductId === null`) в `Movement` не пишем — ревью-UI (3c) сопоставляет их вручную из `sheet.rawRecognition`, после чего движения досоздаются.
- **Конвертация дат:** `MovementRecord.date` / `SheetRecord.dates` — ISO-строки `YYYY-MM-DD`; в Prisma `@db.Date` репозиторий передаёт `new Date(date)` на границе записи.
- **Инфра-решения для 3b** (поднять перед стартом): Postgres (Neon через Vercel?), хранилище фото (Vercel Blob?), переиспользовать существующую Telegram-инфраструктуру или новый бот, объём NextAuth.

## Дальнейшие планы
- **Plan 3b** — миграция Postgres + Prisma-репозитории (upsert по `(pointId, productId, date)`, дедуп по `imageHash`, кросс-листовой `prevOstatok`) + `persistRecognition` + Telegram-вебхук + веб-загрузка + Vercel Blob. Интеграц. тесты на реальной БД (гейт `DATABASE_URL`).
- **Plan 3c** — ревью-UI (подсветка «Остатка» и неуверенных ячеек, ручное сопоставление `unknownLines`/несопоставленных строк) + NextAuth.
- **Plan 4** — дашборд остатков/продаж/списаний + блок «залежалось» (Точка 2) на `computeAging`.

## Self-review (выполнено при написании)
- **Покрытие:** §5 запись → `recognitionToRecords` (Task 2); §8 `soldCalc` внутри листа → `movementsForRow`; §12 статус `needs_review` (несопоставление / ambiguous / unknownLines) + ключ дедупа `computeImageHash` (Task 1). Реальная запись/дедуп/кросс-лист — явно отнесены к 3b.
- **Плейсхолдеры:** нет — полный код и команды в каждом шаге.
- **Согласованность типов:** `RecognitionResult`/`RecognizedRow` из Plan 2 (`@/lib/recognition/schema`); `computeSold` из Plan 1 (сигнатура `{prevOstatok, prihod, spisanie, ostatok}` — совпадает); `PersistContext`/`SheetRecord`/`MovementRecord`/`UnknownLineRecord` определены в Task 2 и согласованы с полями Prisma-моделей из Plan 1 (`prihod/ostatok/spisanie/soldCalc/confidence/rawCell/manuallyEdited`, `Sheet.status`, `UnknownLine.status`).
- **Чистота:** оба модуля без сети/Prisma/fs (кроме `node:crypto` для хэша) — тестируются офлайн.

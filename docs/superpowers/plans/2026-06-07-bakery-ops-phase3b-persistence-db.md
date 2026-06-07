# Bakery Ops — Phase 1, Plan 3b: Персистентность + ingest-пайплайн

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Записать результат маппинга (Plan 3a) в Postgres (Neon) и собрать ingest-пайплайн «байты фото → дедуп → Blob → распознавание → запись». Код пишется офлайн; работа с реальной БД/Blob — за инъектируемыми зависимостями и гейтами (`DATABASE_URL`), как распознавание было за инъекцией клиента.

**Architecture:** Чистые помощники (`toDbDate`, кросс-листовой досчёт `soldCalc`) — юнит-тесты. Prisma-репозитории и `persistRecognition` принимают `PrismaClient` параметром (DI, без импорта синглтона в тестах) — интеграц.-тесты гейтятся `DATABASE_URL`. `ingestSheetPhoto` — оркестратор пайплайна с инъекцией Blob/recognize/persist → юнит-тесты на фейках без сети/БД. Маршруты Telegram/веб (тонкая склейка) — Plan 3c.

**Tech Stack:** Prisma 7 + PostgreSQL (Neon), `@vercel/blob`, TypeScript, Vitest. Опирается на Plan 1 (`computeSold`, схема), 3a (`recognitionToRecords`, `computeImageHash`, типы записей), 2 (`recognizeSheet`, `RecognitionResult`, `CatalogEntry`). Ветка `phase3b-persistence-db` (от `phase3a-persistence`).

**Покрытие спеки:** §5 (запись в БД), §7 (поток захвата → запись), §8 (кросс-листовой `soldCalc`), §12 (дедуп по `imageHash`).

---

### Task 1: Prisma-клиент (ленивый) + начальный SQL

**Files:** create `src/lib/db/client.ts`; create `prisma/init.sql` (через `migrate diff`, без подключения к БД).

- [ ] **Step 1: Ленивый клиент `src/lib/db/client.ts`** (не конструируется на импорте — тесты его не дёргают)

```ts
import { PrismaClient } from '@prisma/client';

const g = globalThis as unknown as { __prisma?: PrismaClient };

/** Ленивый синглтон (для маршрутов/serverless). Тесты используют DI, не это. */
export function getPrisma(): PrismaClient {
  if (!g.__prisma) {
    g.__prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  }
  return g.__prisma;
}
```

- [ ] **Step 2: Сгенерировать начальный SQL из схемы (без БД)**

Run: `cd /Users/nkola/bakery-ops && npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/init.sql`
Expected: создан `prisma/init.sql` с `CREATE TABLE ...` для Point/Product/Sheet/Movement/UnknownLine + enum-типов. (Команда работает офлайн — она не подключается к БД.) Если Prisma 7 ведёт себя иначе и требует подключения — сообщи BLOCKED, не выдумывай SQL.

- [ ] **Step 3: Проверить, что SQL непустой и содержит таблицы**

Run: `cd /Users/nkola/bakery-ops && grep -c "CREATE TABLE" prisma/init.sql`
Expected: число ≥ 5.

- [ ] **Step 4: Проверка типов и коммит**

Run: `cd /Users/nkola/bakery-ops && npx tsc --noEmit`
Expected: чисто.

```bash
cd /Users/nkola/bakery-ops
git add src/lib/db/client.ts prisma/init.sql
git commit -m "feat(db): ленивый Prisma-клиент + начальный SQL из схемы"
```

(Каноническая миграция `prisma migrate dev --name init` создаётся при провижининге с реальным `DATABASE_URL`; `prisma/init.sql` — справочный/для ручного применения.)

---

### Task 2: Чистые помощники — даты и кросс-листовой досчёт

**Files:** create `src/lib/db/dates.ts` + `src/lib/db/dates.test.ts`; create `src/lib/db/backfill-sold.ts` + `src/lib/db/backfill-sold.test.ts`.

- [ ] **Step 1: Падающий тест `src/lib/db/dates.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { toDbDate } from './dates';

describe('toDbDate', () => {
  it('ISO YYYY-MM-DD → UTC-полночь Date', () => {
    expect(toDbDate('2026-06-06').toISOString()).toBe('2026-06-06T00:00:00.000Z');
  });
});
```

- [ ] **Step 2: Запустить — FAIL** (`cd /Users/nkola/bakery-ops && npx vitest run src/lib/db/dates.test.ts`)

- [ ] **Step 3: Реализовать `src/lib/db/dates.ts`**

```ts
/** ISO 'YYYY-MM-DD' → Date в UTC-полночь (совпадает с конвенцией computeAging). */
export function toDbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}
```

- [ ] **Step 4: Запустить — PASS**

- [ ] **Step 5: Падающий тест `src/lib/db/backfill-sold.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { backfillCrossSheetSold } from './backfill-sold';
import type { MovementRecord } from '@/lib/persistence/recognition-to-records';

const mv = (date: string, prihod: number | null, ostatok: number | null, soldCalc: number | null): MovementRecord => ({
  pointId: 'pt1', productId: 'p1', date, prihod, ostatok, spisanie: null, soldCalc,
  sheetId: 'sh1', confidence: 1, rawCell: { prihod: '', ostatok: '', spisanie: '' }, manuallyEdited: false,
});

describe('backfillCrossSheetSold', () => {
  it('первый день листа без базы → досчитывает из вчерашнего остатка БД', async () => {
    const movements = [mv('2026-06-06', 8, 9, null)]; // soldCalc null (нет внутрилистовой базы)
    const lookup = async () => 3; // вчерашний остаток из БД
    const out = await backfillCrossSheetSold(movements, lookup);
    expect(out[0].soldCalc).toBe(2); // 3 + 8 - 0 - 9
  });

  it('нет данных за прошлый день → остаётся null', async () => {
    const out = await backfillCrossSheetSold([mv('2026-06-06', 8, 9, null)], async () => null);
    expect(out[0].soldCalc).toBeNull();
  });

  it('уже посчитанный внутри листа soldCalc не трогаем', async () => {
    const out = await backfillCrossSheetSold([mv('2026-06-06', 8, 9, 5)], async () => 100);
    expect(out[0].soldCalc).toBe(5);
  });

  it('досчитывает только самый ранний день каждого товара', async () => {
    const movements = [mv('2026-06-05', 10, 5, null), mv('2026-06-06', 8, 9, 4)];
    const out = await backfillCrossSheetSold(movements, async () => 2);
    expect(out[0].soldCalc).toBe(7); // 2 + 10 - 0 - 5  (ранний день)
    expect(out[1].soldCalc).toBe(4); // не тронут
  });
});
```

- [ ] **Step 6: Запустить — FAIL**

- [ ] **Step 7: Реализовать `src/lib/db/backfill-sold.ts`**

```ts
import { computeSold } from '@/lib/domain/computeSold';
import type { MovementRecord } from '@/lib/persistence/recognition-to-records';

/** Возвращает вчерашний остаток товара из БД (даты строго раньше beforeDate) или null. */
export type PrevOstatokLookup = (
  pointId: string,
  productId: string,
  beforeDate: string,
) => Promise<number | null>;

/**
 * Досчитывает soldCalc для самого раннего дня каждого товара в листе,
 * если внутри листа базы не было (soldCalc === null), подтягивая вчерашний остаток из БД.
 */
export async function backfillCrossSheetSold(
  movements: MovementRecord[],
  lookup: PrevOstatokLookup,
): Promise<MovementRecord[]> {
  const earliestIdxByKey = new Map<string, number>();
  movements.forEach((m, i) => {
    const key = `${m.pointId}::${m.productId}`;
    const cur = earliestIdxByKey.get(key);
    if (cur === undefined || m.date < movements[cur].date) earliestIdxByKey.set(key, i);
  });

  const result = movements.map((m) => ({ ...m }));
  for (const idx of earliestIdxByKey.values()) {
    const m = result[idx];
    if (m.soldCalc !== null) continue;
    const prev = await lookup(m.pointId, m.productId, m.date);
    if (prev === null) continue;
    const { sold } = computeSold({
      prevOstatok: prev,
      prihod: m.prihod,
      spisanie: m.spisanie,
      ostatok: m.ostatok,
    });
    result[idx] = { ...m, soldCalc: sold };
  }
  return result;
}
```

- [ ] **Step 8: Запустить — PASS, затем коммит**

```bash
cd /Users/nkola/bakery-ops
git add src/lib/db/dates.ts src/lib/db/dates.test.ts src/lib/db/backfill-sold.ts src/lib/db/backfill-sold.test.ts
git commit -m "feat(db): toDbDate + backfillCrossSheetSold (досчёт первого дня из БД)"
```

---

### Task 3: Репозитории + `persistRecognition`

Все функции принимают `PrismaClient` параметром (DI). Запись в реальную БД проверяется интеграц.-тестом с гейтом `DATABASE_URL` (офлайн — skip).

**Files:** create `src/lib/db/movements-repo.ts`; create `src/lib/db/persist-recognition.ts`; create `src/lib/db/persist-recognition.integration.test.ts`.

- [ ] **Step 1: Реализовать `src/lib/db/movements-repo.ts`**

```ts
import { Prisma, type PrismaClient } from '@prisma/client';
import { toDbDate } from './dates';
import type {
  SheetRecord,
  MovementRecord,
  UnknownLineRecord,
} from '@/lib/persistence/recognition-to-records';

export async function findSheetByImageHash(prisma: PrismaClient, imageHash: string) {
  return prisma.sheet.findFirst({ where: { imageHash } });
}

export async function getPreviousOstatok(
  prisma: PrismaClient,
  pointId: string,
  productId: string,
  beforeDate: string,
): Promise<number | null> {
  const prev = await prisma.movement.findFirst({
    where: { pointId, productId, date: { lt: toDbDate(beforeDate) }, ostatok: { not: null } },
    orderBy: { date: 'desc' },
    select: { ostatok: true },
  });
  return prev?.ostatok ?? null;
}

export async function createSheet(prisma: PrismaClient, sheet: SheetRecord) {
  return prisma.sheet.create({
    data: {
      id: sheet.id,
      pointId: sheet.pointId,
      sheetType: sheet.sheetType,
      imageUrl: sheet.imageUrl,
      imageHash: sheet.imageHash,
      dates: sheet.dates.map(toDbDate),
      source: sheet.source,
      uploadedBy: sheet.uploadedBy ?? undefined,
      status: sheet.status,
      rawRecognition: sheet.rawRecognition as unknown as Prisma.InputJsonValue,
    },
  });
}

export async function upsertMovements(prisma: PrismaClient, movements: MovementRecord[]) {
  for (const m of movements) {
    const date = toDbDate(m.date);
    await prisma.movement.upsert({
      where: { pointId_productId_date: { pointId: m.pointId, productId: m.productId, date } },
      create: {
        pointId: m.pointId,
        productId: m.productId,
        date,
        prihod: m.prihod,
        ostatok: m.ostatok,
        spisanie: m.spisanie,
        soldCalc: m.soldCalc,
        sheetId: m.sheetId,
        confidence: m.confidence,
        rawCell: m.rawCell as unknown as Prisma.InputJsonValue,
        manuallyEdited: m.manuallyEdited,
      },
      update: {
        prihod: m.prihod,
        ostatok: m.ostatok,
        spisanie: m.spisanie,
        soldCalc: m.soldCalc,
        sheetId: m.sheetId,
        confidence: m.confidence,
        rawCell: m.rawCell as unknown as Prisma.InputJsonValue,
      },
    });
  }
}

export async function createUnknownLines(prisma: PrismaClient, lines: UnknownLineRecord[]) {
  if (lines.length === 0) return;
  await prisma.unknownLine.createMany({
    data: lines.map((l) => ({
      sheetId: l.sheetId,
      pointId: l.pointId,
      date: l.date ? toDbDate(l.date) : null,
      rawText: l.rawText,
      parsedNumbers: l.parsedNumbers ?? undefined,
      status: l.status,
    })),
  });
}
```

- [ ] **Step 2: Реализовать `src/lib/db/persist-recognition.ts`**

```ts
import type { PrismaClient } from '@prisma/client';
import type { RecognitionRecords } from '@/lib/persistence/recognition-to-records';
import { backfillCrossSheetSold } from './backfill-sold';
import {
  findSheetByImageHash,
  getPreviousOstatok,
  createSheet,
  upsertMovements,
  createUnknownLines,
} from './movements-repo';

export type PersistResult = { deduped: boolean; sheetId: string };

/** Дедуп по imageHash; досчёт первого дня из БД; запись Sheet + Movements + UnknownLines. */
export async function persistRecognition(
  prisma: PrismaClient,
  records: RecognitionRecords,
): Promise<PersistResult> {
  const existing = await findSheetByImageHash(prisma, records.sheet.imageHash);
  if (existing) return { deduped: true, sheetId: existing.id };

  const movements = await backfillCrossSheetSold(records.movements, (pointId, productId, beforeDate) =>
    getPreviousOstatok(prisma, pointId, productId, beforeDate),
  );

  // Записи последовательно. (Обёртка в $transaction — харднинг-фоллоуап; см. заметки.)
  await createSheet(prisma, records.sheet);
  await upsertMovements(prisma, movements);
  await createUnknownLines(prisma, records.unknownLines);

  return { deduped: false, sheetId: records.sheet.id };
}
```

- [ ] **Step 3: Интеграц.-тест с гейтом `src/lib/db/persist-recognition.integration.test.ts`**

```ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { persistRecognition } from './persist-recognition';
import { findSheetByImageHash } from './movements-repo';
import type { RecognitionRecords } from '@/lib/persistence/recognition-to-records';

const hasDb = !!process.env.DATABASE_URL;

describe.skipIf(!hasDb)('persistRecognition (реальная БД)', () => {
  const prisma = new PrismaClient({ datasourceUrl: process.env.DATABASE_URL });
  const hash = `test-${Date.now()}`;

  beforeAll(async () => {
    // предполагается мигрированная тестовая БД + существующие Point 'pt-test' и Product 'pr-test'
    await prisma.point.upsert({ where: { id: 'pt-test' }, update: {}, create: { id: 'pt-test', name: 'TEST POINT' } });
    await prisma.product.upsert({
      where: { name_sheetType: { name: 'TEST SKU', sheetType: 'pies' } },
      update: {}, create: { id: 'pr-test', name: 'TEST SKU', sheetType: 'pies' },
    });
  });

  afterAll(async () => {
    await prisma.movement.deleteMany({ where: { pointId: 'pt-test' } });
    await prisma.unknownLine.deleteMany({ where: { pointId: 'pt-test' } });
    await prisma.sheet.deleteMany({ where: { imageHash: hash } });
    await prisma.$disconnect();
  });

  it('пишет Sheet + Movement и дедупит повтор', async () => {
    const records: RecognitionRecords = {
      sheet: {
        id: `sh-${hash}`, pointId: 'pt-test', sheetType: 'pies',
        imageUrl: 'blob://t', imageHash: hash, dates: ['2026-06-06'],
        source: 'web', uploadedBy: null, status: 'recognized',
        rawRecognition: { pointHint: null, sheetType: 'pies', dates: ['2026-06-06'], rows: [], unknownLines: [], warnings: [] },
      },
      movements: [{
        pointId: 'pt-test', productId: 'pr-test', date: '2026-06-06',
        prihod: 8, ostatok: 9, spisanie: null, soldCalc: null,
        sheetId: `sh-${hash}`, confidence: 1, rawCell: { prihod: '8', ostatok: '9', spisanie: '' }, manuallyEdited: false,
      }],
      unknownLines: [],
    };

    const first = await persistRecognition(prisma, records);
    expect(first.deduped).toBe(false);
    expect(await findSheetByImageHash(prisma, hash)).not.toBeNull();

    const second = await persistRecognition(prisma, records);
    expect(second.deduped).toBe(true);
  }, 30_000);
});
```

- [ ] **Step 4: Типы + весь набор (интеграц. — skip офлайн)**

Run: `cd /Users/nkola/bakery-ops && npx tsc --noEmit && npm test`
Expected: tsc чисто; все тесты PASS, интеграц. — skipped. (Если `Prisma.InputJsonValue` или генерённые типы не резолвятся — убедись, что `npx prisma generate` отработал; при проблеме Prisma 7 сообщи.)

- [ ] **Step 5: Коммит**

```bash
cd /Users/nkola/bakery-ops
git add src/lib/db/movements-repo.ts src/lib/db/persist-recognition.ts src/lib/db/persist-recognition.integration.test.ts
git commit -m "feat(db): репозитории + persistRecognition (дедуп, кросс-лист досчёт, запись)"
```

---

### Task 4: Blob-адаптер + `ingestSheetPhoto`

**Files:** install `@vercel/blob`; create `src/lib/storage/blob.ts` (интерфейс + Vercel-impl); create `src/lib/ingest/ingest-sheet.ts` + `src/lib/ingest/ingest-sheet.test.ts`.

- [ ] **Step 1: Установить `@vercel/blob`**

```bash
cd /Users/nkola/bakery-ops
npm install @vercel/blob
```

- [ ] **Step 2: `src/lib/storage/blob.ts` — интерфейс + реальная реализация**

```ts
import { put } from '@vercel/blob';

export type BlobStore = {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<{ url: string }>;
};

/** Реальное хранилище (Vercel Blob). Токен берётся из env BLOB_READ_WRITE_TOKEN. */
export const vercelBlobStore: BlobStore = {
  async put(key, bytes, contentType) {
    const res = await put(key, Buffer.from(bytes), { access: 'public', contentType, addRandomSuffix: false });
    return { url: res.url };
  },
};
```

- [ ] **Step 3: Падающий тест `src/lib/ingest/ingest-sheet.test.ts`**

```ts
import { describe, it, expect, vi } from 'vitest';
import { ingestSheetPhoto, type IngestDeps } from './ingest-sheet';
import type { CatalogEntry } from '@/lib/recognition/match-product';
import type { RecognitionResult } from '@/lib/recognition/schema';

const catalog: CatalogEntry[] = [{ id: 'p5', name: 'Самса' }];

const recogResult: RecognitionResult = {
  pointHint: 'Точка 1', sheetType: 'pies', dates: ['2026-06-06'],
  rows: [{
    productName: 'Самса', matchedProductId: 'p5', matchConfidence: 1,
    cells: [{ date: '2026-06-06',
      prihod: { value: 8, raw: '8', parts: [8], ambiguous: false },
      ostatok: { value: 9, raw: '9', parts: [9], ambiguous: false },
      spisanie: { value: null, raw: '', parts: [], ambiguous: false } }],
  }],
  unknownLines: [], warnings: [],
};

function deps(overrides: Partial<IngestDeps> = {}): IngestDeps {
  return {
    blob: { put: vi.fn(async () => ({ url: 'blob://sheets/x.jpg' })) },
    recognize: vi.fn(async () => recogResult),
    findSheetByHash: vi.fn(async () => null),
    persist: vi.fn(async () => ({ deduped: false, sheetId: 'sh-new' })),
    newId: () => 'sh-new',
    ...overrides,
  };
}

const input = {
  bytes: new Uint8Array([1, 2, 3]),
  mediaType: 'image/jpeg' as const,
  pointId: 'pt1', sheetType: 'pies' as const, source: 'telegram' as const,
  uploadedBy: null, catalog,
};

describe('ingestSheetPhoto', () => {
  it('новый лист: blob → recognize → persist, статус из записей', async () => {
    const d = deps();
    const res = await ingestSheetPhoto(input, d);
    expect(d.blob.put).toHaveBeenCalledOnce();
    expect(d.recognize).toHaveBeenCalledOnce();
    expect(d.persist).toHaveBeenCalledOnce();
    expect(res).toMatchObject({ sheetId: 'sh-new', status: 'recognized', deduped: false });
  });

  it('дубликат (хэш уже есть): не грузит в blob, не распознаёт', async () => {
    const d = deps({ findSheetByHash: vi.fn(async () => ({ id: 'sh-old' })) });
    const res = await ingestSheetPhoto(input, d);
    expect(res).toMatchObject({ sheetId: 'sh-old', status: 'duplicate', deduped: true });
    expect(d.blob.put).not.toHaveBeenCalled();
    expect(d.recognize).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 4: Запустить — FAIL** (`cd /Users/nkola/bakery-ops && npx vitest run src/lib/ingest/ingest-sheet.test.ts`)

- [ ] **Step 5: Реализовать `src/lib/ingest/ingest-sheet.ts`**

```ts
import { computeImageHash } from '@/lib/persistence/image-hash';
import { recognitionToRecords, type RecognitionRecords } from '@/lib/persistence/recognition-to-records';
import type { BlobStore } from '@/lib/storage/blob';
import type { CatalogEntry } from '@/lib/recognition/match-product';
import type { RecognitionResult } from '@/lib/recognition/schema';
import type { SheetType } from '@/lib/domain/types';

export type IngestInput = {
  bytes: Uint8Array;
  mediaType: 'image/jpeg' | 'image/png' | 'image/webp';
  pointId: string;
  sheetType: SheetType;
  source: 'telegram' | 'web';
  uploadedBy?: string | null;
  catalog: CatalogEntry[];
};

export type IngestDeps = {
  blob: BlobStore;
  recognize: (args: {
    image: { kind: 'base64'; mediaType: IngestInput['mediaType']; data: string };
    catalog: CatalogEntry[];
    sheetType: SheetType;
  }) => Promise<RecognitionResult>;
  findSheetByHash: (hash: string) => Promise<{ id: string } | null>;
  persist: (records: RecognitionRecords) => Promise<{ deduped: boolean; sheetId: string }>;
  newId: () => string;
};

export type IngestResult = {
  sheetId: string;
  status: 'recognized' | 'needs_review' | 'duplicate';
  deduped: boolean;
};

export async function ingestSheetPhoto(input: IngestInput, deps: IngestDeps): Promise<IngestResult> {
  const imageHash = computeImageHash(input.bytes);

  const existing = await deps.findSheetByHash(imageHash);
  if (existing) return { sheetId: existing.id, status: 'duplicate', deduped: true };

  const sheetId = deps.newId();
  const { url } = await deps.blob.put(`sheets/${sheetId}.jpg`, input.bytes, input.mediaType);

  const result = await deps.recognize({
    image: { kind: 'base64', mediaType: input.mediaType, data: Buffer.from(input.bytes).toString('base64') },
    catalog: input.catalog,
    sheetType: input.sheetType,
  });

  const records = recognitionToRecords(result, {
    pointId: input.pointId,
    sheetId,
    imageUrl: url,
    imageHash,
    source: input.source,
    uploadedBy: input.uploadedBy ?? null,
  });

  await deps.persist(records);
  return { sheetId, status: records.sheet.status, deduped: false };
}
```

- [ ] **Step 6: Запустить — PASS; затем весь набор + типы**

Run: `cd /Users/nkola/bakery-ops && npm test && npx tsc --noEmit`
Expected: все PASS (интеграц. — skipped), tsc чисто.

- [ ] **Step 7: Коммит**

```bash
cd /Users/nkola/bakery-ops
git add package.json package-lock.json src/lib/storage/blob.ts src/lib/ingest/ingest-sheet.ts src/lib/ingest/ingest-sheet.test.ts
git commit -m "feat(ingest): Blob-адаптер + ingestSheetPhoto (хэш→дедуп→blob→recognize→persist)"
```

---

## Заметки для провижининга и 3c
- **Запуск БД:** завести Neon через Vercel, получить `DATABASE_URL`, применить `prisma/init.sql` или `npx prisma migrate dev --name init`, затем `npx prisma generate`. После этого интеграц.-тесты (`DATABASE_URL` задан) перестают пропускаться.
- **Транзакция:** `persistRecognition` пишет последовательно; обернуть в `prisma.$transaction` (атомарность Sheet+Movements+UnknownLines) — харднинг-фоллоуап.
- **Сиды:** `Point` (Точка 1/2) и `Product` (из `SEED_CATALOG`) нужно засидить перед реальным ingest (скрипт сида — в провижининге/3c).
- **3c:** маршруты `app/api/telegram/route.ts` (новый бот, вебхук → скачать фото → `ingestSheetPhoto` с `vercelBlobStore` + `recognizeSheet` + `persistRecognition(getPrisma(), …)`) и `app/api/upload/route.ts` (веб-загрузка) — тонкая склейка поверх `ingestSheetPhoto`. Плюс ревью-UI и NextAuth.

## Self-review (выполнено при написании)
- **Покрытие:** §5 запись → Task 3; §7 поток захвата → `ingestSheetPhoto` (Task 4); §8 кросс-лист `soldCalc` → `backfillCrossSheetSold` (Task 2) + `getPreviousOstatok` (Task 3); §12 дедуп → `findSheetByImageHash` + ingest-проверка хэша. Маршруты/UI/auth — явно в 3c.
- **Плейсхолдеры:** нет — полный код/команды в каждом шаге.
- **Согласованность типов:** `MovementRecord/SheetRecord/UnknownLineRecord/RecognitionRecords` из 3a; `computeSold` из Plan 1; `recognizeSheet`-совместимая сигнатура `recognize` (image base64 + catalog + sheetType) из Plan 2; имена Prisma-полей совпадают со схемой Plan 1 (`pointId_productId_date`, `name_sheetType`, `rawRecognition`, `rawCell` Json). DI: репозитории/persist берут `PrismaClient` параметром → тесты не конструируют клиент на импорте; реальный клиент — ленивый `getPrisma()`.
- **Изоляция инфры:** сеть/БД только за инъекцией (`IngestDeps`) и за гейтом `DATABASE_URL`; чистое ядро (Task 2, ingest на фейках) — офлайн.

# Bakery Ops — Phase 1, Plan 2: Recognition (vision-распознавание листов)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Реализовать распознавание фото бумажного листа через Anthropic vision: модель транскрибирует ячейки по известному каталогу, а детерминированный код (`parseQuantity` из Plan 1) нормализует числа и сопоставляет строки с каталогом.

**Architecture:** Чистое ядро (схема, сопоставление с каталогом, нормализация, сборка промпта) — без сети, полностью покрыто юнит-тестами. Сетевой вызов изолирован в `recognizeSheet(input, client)` с инъекцией клиента, чтобы тестировать оркестрацию на стабе без обращения к API. Ключевой принцип: **модель только транскрибирует** («24+12+6» возвращает строкой), арифметику и сверку «=итог» делает `parseQuantity`.

**Tech Stack:** `@anthropic-ai/sdk` (vision + `messages.parse` со structured output), `zod` (схема ответа), модель `claude-opus-4-8` (high-res vision, лучшая точность по рукописи), Vitest.

**Опирается на Plan 1:** `parseQuantity`, `ParsedQuantity`, `SheetType` из `src/lib/domain/`. Ветка: `phase2-recognition` (от `phase1-foundation`).

**Покрытие спеки:** §6 (распознавание), частично §12 (новые/дописанные строки → `unknownLines`, низкая уверенность). Захват/подтверждение/БД — Plan 3.

---

### Task 1: Зависимости + схема ответа

**Files:**
- Modify: `package.json` (deps)
- Create: `src/lib/recognition/schema.ts`
- Test: `src/lib/recognition/schema.test.ts`

- [ ] **Step 1: Установить зависимости**

```bash
cd /Users/nkola/bakery-ops
npm install @anthropic-ai/sdk zod
```

- [ ] **Step 2: Написать падающий тест `src/lib/recognition/schema.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { RawRecognitionSchema } from './schema';

describe('RawRecognitionSchema', () => {
  it('принимает валидный сырой ответ', () => {
    const raw = {
      pointHint: 'Точка 1',
      sheetType: 'pies',
      dates: ['2026-06-05', '2026-06-06'],
      rows: [
        {
          productName: 'Самса',
          cells: [
            { date: '2026-06-05', prihod: '8', ostatok: '3', spisanie: null },
            { date: '2026-06-06', prihod: '8', ostatok: '9', spisanie: null },
          ],
        },
      ],
      unknownLines: [{ rawText: 'тесто 3кг', note: null }],
      warnings: [],
    };
    expect(() => RawRecognitionSchema.parse(raw)).not.toThrow();
  });

  it('отклоняет неизвестный sheetType', () => {
    expect(() =>
      RawRecognitionSchema.parse({
        pointHint: null, sheetType: 'bread', dates: [], rows: [], unknownLines: [], warnings: [],
      }),
    ).toThrow();
  });
});
```

- [ ] **Step 3: Запустить — убедиться, что падает**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/recognition/schema.test.ts`
Expected: FAIL (Cannot find module './schema')

- [ ] **Step 4: Реализовать `src/lib/recognition/schema.ts`**

```ts
import { z } from 'zod';
import type { ParsedQuantity, SheetType } from '@/lib/domain/types';

export const SHEET_TYPES = ['pies', 'desserts', 'confectionery_freeform'] as const;

export const RawCellSchema = z.object({
  date: z.string(),
  prihod: z.string().nullable(),
  ostatok: z.string().nullable(),
  spisanie: z.string().nullable(),
});
export const RawRowSchema = z.object({
  productName: z.string(),
  cells: z.array(RawCellSchema),
});
export const RawUnknownLineSchema = z.object({
  rawText: z.string(),
  note: z.string().nullable(),
});
export const RawRecognitionSchema = z.object({
  pointHint: z.string().nullable(),
  sheetType: z.enum(SHEET_TYPES),
  dates: z.array(z.string()),
  rows: z.array(RawRowSchema),
  unknownLines: z.array(RawUnknownLineSchema),
  warnings: z.array(z.string()),
});

export type RawRecognition = z.infer<typeof RawRecognitionSchema>;
export type RawRow = z.infer<typeof RawRowSchema>;
export type RawCell = z.infer<typeof RawCellSchema>;

/** Нормализованная ячейка: числа разобраны parseQuantity. */
export type NormalizedCell = {
  date: string;
  prihod: ParsedQuantity;
  ostatok: ParsedQuantity;
  spisanie: ParsedQuantity;
};
export type RecognizedRow = {
  productName: string;
  matchedProductId: string | null;
  matchConfidence: number;
  cells: NormalizedCell[];
};
export type RecognitionResult = {
  pointHint: string | null;
  sheetType: SheetType;
  dates: string[];
  rows: RecognizedRow[];
  unknownLines: { rawText: string; note: string | null }[];
  warnings: string[];
};
```

- [ ] **Step 5: Запустить — убедиться, что проходит**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/recognition/schema.test.ts`
Expected: PASS

- [ ] **Step 6: Коммит**

```bash
cd /Users/nkola/bakery-ops
git add package.json package-lock.json src/lib/recognition/schema.ts src/lib/recognition/schema.test.ts
git commit -m "feat(recognition): zod-схема ответа vision + типы результата"
```

---

### Task 2: Сопоставление строки с каталогом

**Files:**
- Create: `src/lib/recognition/match-product.ts`
- Test: `src/lib/recognition/match-product.test.ts`

- [ ] **Step 1: Написать падающий тест `src/lib/recognition/match-product.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { matchProductToCatalog, normalizeName, type CatalogEntry } from './match-product';

const catalog: CatalogEntry[] = [
  { id: 'p1', name: 'Самса' },
  { id: 'p2', name: 'Пицца открытая' },
  { id: 'p3', name: 'Сосиска в тесте', aliases: ['Сосиска в тексе'] },
  { id: 'p4', name: 'Хлеб «Бородинский»' },
];

describe('normalizeName', () => {
  it('убирает кавычки/скобки/ё и схлопывает пробелы', () => {
    expect(normalizeName('Хлеб «Бородинский»')).toBe('хлеб бородинский');
    expect(normalizeName('Пирожок (беккен)  с  капустой')).toBe('пирожок беккен с капустой');
  });
});

describe('matchProductToCatalog', () => {
  it('точное совпадение по имени → confidence 1', () => {
    expect(matchProductToCatalog('Самса', catalog)).toMatchObject({ productId: 'p1', confidence: 1 });
  });

  it('совпадение по алиасу (рукописный вариант) → confidence 1', () => {
    expect(matchProductToCatalog('Сосиска в тексе', catalog)).toMatchObject({ productId: 'p3', confidence: 1 });
  });

  it('перестановка слов → нечёткое совпадение выше порога', () => {
    const m = matchProductToCatalog('Бородинский хлеб', catalog);
    expect(m.productId).toBe('p4');
    expect(m.confidence).toBeGreaterThanOrEqual(0.5);
  });

  it('нет в каталоге → productId null', () => {
    expect(matchProductToCatalog('Шаурма', catalog)).toMatchObject({ productId: null });
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/recognition/match-product.test.ts`
Expected: FAIL (Cannot find module './match-product')

- [ ] **Step 3: Реализовать `src/lib/recognition/match-product.ts`**

```ts
export type CatalogEntry = {
  id: string;
  name: string;
  aliases?: string[];
};

export type ProductMatch = { productId: string | null; confidence: number };

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'“”]/g, '')
    .replace(/[()]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalizeName(s).split(' ').filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function matchProductToCatalog(
  rawName: string,
  catalog: CatalogEntry[],
  threshold = 0.5,
): ProductMatch {
  const target = normalizeName(rawName);

  // Точное совпадение по имени или алиасу.
  for (const p of catalog) {
    const variants = [p.name, ...(p.aliases ?? [])].map(normalizeName);
    if (variants.includes(target)) return { productId: p.id, confidence: 1 };
  }

  // Нечёткое: лучший Jaccard по токенам среди имени и алиасов.
  const targetTokens = tokenSet(rawName);
  let best: ProductMatch = { productId: null, confidence: 0 };
  for (const p of catalog) {
    let score = 0;
    for (const variant of [p.name, ...(p.aliases ?? [])]) {
      score = Math.max(score, jaccard(targetTokens, tokenSet(variant)));
    }
    if (score > best.confidence) best = { productId: p.id, confidence: score };
  }
  return best.confidence >= threshold ? best : { productId: null, confidence: best.confidence };
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/recognition/match-product.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
cd /Users/nkola/bakery-ops
git add src/lib/recognition/match-product.ts src/lib/recognition/match-product.test.ts
git commit -m "feat(recognition): сопоставление строки с мастер-каталогом (имя/алиас/нечёткое)"
```

---

### Task 3: Нормализация сырого ответа

**Files:**
- Create: `src/lib/recognition/normalize.ts`
- Test: `src/lib/recognition/normalize.test.ts`

- [ ] **Step 1: Написать падающий тест `src/lib/recognition/normalize.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { normalizeRecognition } from './normalize';
import type { RawRecognition } from './schema';
import type { CatalogEntry } from './match-product';

const catalog: CatalogEntry[] = [{ id: 'p2', name: 'Пицца открытая' }];

const raw: RawRecognition = {
  pointHint: 'Точка 1',
  sheetType: 'pies',
  dates: ['2026-06-06'],
  rows: [
    {
      productName: 'Пицца открытая',
      cells: [{ date: '2026-06-06', prihod: '24+12+6', ostatok: '4-3', spisanie: null }],
    },
    {
      productName: 'Неведомая позиция',
      cells: [{ date: '2026-06-06', prihod: '5', ostatok: null, spisanie: null }],
    },
  ],
  unknownLines: [{ rawText: 'тесто 3кг', note: null }],
  warnings: ['кривое фото снизу'],
};

describe('normalizeRecognition', () => {
  it('разбирает числа через parseQuantity и сопоставляет каталог', () => {
    const res = normalizeRecognition(raw, catalog);
    const row = res.rows[0];
    expect(row.matchedProductId).toBe('p2');
    expect(row.matchConfidence).toBe(1);
    expect(row.cells[0].prihod.value).toBe(42);
    expect(row.cells[0].ostatok.value).toBe(1);
    expect(row.cells[0].spisanie.value).toBeNull();
  });

  it('строка без совпадения → matchedProductId null (на ревью)', () => {
    const res = normalizeRecognition(raw, catalog);
    expect(res.rows[1].matchedProductId).toBeNull();
  });

  it('пробрасывает unknownLines, warnings, dates, pointHint, sheetType', () => {
    const res = normalizeRecognition(raw, catalog);
    expect(res.unknownLines).toEqual([{ rawText: 'тесто 3кг', note: null }]);
    expect(res.warnings).toEqual(['кривое фото снизу']);
    expect(res.dates).toEqual(['2026-06-06']);
    expect(res.pointHint).toBe('Точка 1');
    expect(res.sheetType).toBe('pies');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/recognition/normalize.test.ts`
Expected: FAIL (Cannot find module './normalize')

- [ ] **Step 3: Реализовать `src/lib/recognition/normalize.ts`**

```ts
import { parseQuantity } from '@/lib/domain/parseQuantity';
import { matchProductToCatalog, type CatalogEntry } from './match-product';
import type { RawRecognition, RecognitionResult } from './schema';

export function normalizeRecognition(
  raw: RawRecognition,
  catalog: CatalogEntry[],
): RecognitionResult {
  return {
    pointHint: raw.pointHint,
    sheetType: raw.sheetType,
    dates: raw.dates,
    warnings: raw.warnings,
    unknownLines: raw.unknownLines,
    rows: raw.rows.map((row) => {
      const match = matchProductToCatalog(row.productName, catalog);
      return {
        productName: row.productName,
        matchedProductId: match.productId,
        matchConfidence: match.confidence,
        cells: row.cells.map((cell) => ({
          date: cell.date,
          prihod: parseQuantity(cell.prihod),
          ostatok: parseQuantity(cell.ostatok),
          spisanie: parseQuantity(cell.spisanie),
        })),
      };
    }),
  };
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/recognition/normalize.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
cd /Users/nkola/bakery-ops
git add src/lib/recognition/normalize.ts src/lib/recognition/normalize.test.ts
git commit -m "feat(recognition): нормализация сырого ответа (parseQuantity + каталог)"
```

---

### Task 4: Сборка промпта

**Files:**
- Create: `src/lib/recognition/prompt.ts`
- Test: `src/lib/recognition/prompt.test.ts`

- [ ] **Step 1: Написать падающий тест `src/lib/recognition/prompt.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { buildRecognitionPrompt } from './prompt';
import type { CatalogEntry } from './match-product';

const catalog: CatalogEntry[] = [
  { id: 'p1', name: 'Самса' },
  { id: 'p2', name: 'Пицца открытая' },
];

describe('buildRecognitionPrompt', () => {
  it('включает позиции каталога и тип листа', () => {
    const p = buildRecognitionPrompt(catalog, 'pies');
    expect(p).toContain('Самса');
    expect(p).toContain('Пицца открытая');
    expect(p).toContain('pies');
  });

  it('инструктирует НЕ вычислять, а транскрибировать как написано', () => {
    const p = buildRecognitionPrompt(catalog, 'pies');
    expect(p).toMatch(/не вычисля/i);
    expect(p).toContain('24+12+6');
  });

  it('просит дописанные от руки строки класть в unknownLines', () => {
    const p = buildRecognitionPrompt(catalog, 'pies');
    expect(p).toContain('unknownLines');
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/recognition/prompt.test.ts`
Expected: FAIL (Cannot find module './prompt')

- [ ] **Step 3: Реализовать `src/lib/recognition/prompt.ts`**

```ts
import type { SheetType } from '@/lib/domain/types';
import type { CatalogEntry } from './match-product';

export function buildRecognitionPrompt(catalog: CatalogEntry[], sheetType: SheetType): string {
  const list = catalog.map((p) => `- ${p.name}`).join('\n');
  return [
    'Ты распознаёшь рукописный учётный лист пекарни (движение товара в штуках).',
    `Тип листа: ${sheetType}.`,
    'На печатном шаблоне сверху — даты; под каждой датой подколонки Приход / Остаток / Списание.',
    '',
    'Ожидаемые позиции (печатный список слева):',
    list,
    '',
    'Правила:',
    '- Для каждой найденной строки верни числа КАК НАПИСАНО (строкой), НЕ вычисляй итог.',
    '  «24+12+6» оставь строкой «24+12+6» (не 42). «13-1» оставь строкой «13-1».',
    '  Кружок-итог передай как есть, например «6+3 ⑨».',
    '- Пустая клетка или прочерк → null.',
    '- Если строки нет в списке выше (дописана от руки) — помести её в unknownLines с rawText.',
    '- В warnings опиши проблемы фото (блики, обрезанный край, нечитаемые места).',
    '',
    'Даты возвращай в формате ISO YYYY-MM-DD (год бери с листа, если указан).',
  ].join('\n');
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/recognition/prompt.test.ts`
Expected: PASS

- [ ] **Step 5: Коммит**

```bash
cd /Users/nkola/bakery-ops
git add src/lib/recognition/prompt.ts src/lib/recognition/prompt.test.ts
git commit -m "feat(recognition): сборка промпта по каталогу и типу листа"
```

---

### Task 5: Оркестратор `recognizeSheet`

Изолирует сетевой вызов; клиент инъектируется для тестов. Юнит-тест на стабе (без API). Интеграционный тест на реальном фото — пропускается без `ANTHROPIC_API_KEY` и без фикстуры.

**Files:**
- Create: `src/lib/recognition/recognize-sheet.ts`
- Test: `src/lib/recognition/recognize-sheet.test.ts`

- [ ] **Step 1: Написать падающий тест `src/lib/recognition/recognize-sheet.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { recognizeSheet, type RecognitionClient } from './recognize-sheet';
import type { CatalogEntry } from './match-product';

const catalog: CatalogEntry[] = [{ id: 'p2', name: 'Пицца открытая' }];

function stubClient(parsedOutput: unknown): RecognitionClient {
  return {
    messages: {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      parse: async (_args: unknown) => ({ parsed_output: parsedOutput }),
    },
  };
}

describe('recognizeSheet (стаб клиента)', () => {
  it('нормализует ответ модели: parseQuantity + сопоставление каталога', async () => {
    const client = stubClient({
      pointHint: 'Точка 1',
      sheetType: 'pies',
      dates: ['2026-06-06'],
      rows: [
        {
          productName: 'Пицца открытая',
          cells: [{ date: '2026-06-06', prihod: '24+12+6', ostatok: '4-3', spisanie: null }],
        },
      ],
      unknownLines: [],
      warnings: [],
    });

    const res = await recognizeSheet(
      { image: { kind: 'base64', mediaType: 'image/jpeg', data: 'AAAA' }, catalog, sheetType: 'pies' },
      client,
    );

    expect(res.rows[0].matchedProductId).toBe('p2');
    expect(res.rows[0].cells[0].prihod.value).toBe(42);
    expect(res.rows[0].cells[0].ostatok.value).toBe(1);
  });

  it('бросает, если модель вернула структуру не по схеме', async () => {
    const client = stubClient({ sheetType: 'bread' });
    await expect(
      recognizeSheet(
        { image: { kind: 'base64', mediaType: 'image/jpeg', data: 'AAAA' }, catalog, sheetType: 'pies' },
        client,
      ),
    ).rejects.toThrow();
  });
});
```

- [ ] **Step 2: Запустить — убедиться, что падает**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/recognition/recognize-sheet.test.ts`
Expected: FAIL (Cannot find module './recognize-sheet')

- [ ] **Step 3: Реализовать `src/lib/recognition/recognize-sheet.ts`**

```ts
import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { RawRecognitionSchema, type RecognitionResult } from './schema';
import { buildRecognitionPrompt } from './prompt';
import { normalizeRecognition } from './normalize';
import type { CatalogEntry } from './match-product';
import type { SheetType } from '@/lib/domain/types';

export type ImageInput =
  | { kind: 'base64'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }
  | { kind: 'url'; url: string };

export type RecognizeSheetInput = {
  image: ImageInput;
  catalog: CatalogEntry[];
  sheetType: SheetType;
};

/** Минимальный контракт клиента, который нам нужен (для инъекции стаба в тестах). */
export type RecognitionClient = {
  messages: { parse: (args: unknown) => Promise<{ parsed_output: unknown }> };
};

const MODEL = 'claude-opus-4-8';

function imageBlock(image: ImageInput) {
  if (image.kind === 'base64') {
    return {
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: image.mediaType, data: image.data },
    };
  }
  return { type: 'image' as const, source: { type: 'url' as const, url: image.url } };
}

export async function recognizeSheet(
  input: RecognizeSheetInput,
  client: RecognitionClient = new Anthropic() as unknown as RecognitionClient,
): Promise<RecognitionResult> {
  const prompt = buildRecognitionPrompt(input.catalog, input.sheetType);
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(RawRecognitionSchema) },
    messages: [
      { role: 'user', content: [imageBlock(input.image), { type: 'text', text: prompt }] },
    ],
  });
  const raw = RawRecognitionSchema.parse(response.parsed_output);
  return normalizeRecognition(raw, input.catalog);
}
```

- [ ] **Step 4: Запустить — убедиться, что проходит**

Run: `cd /Users/nkola/bakery-ops && npx vitest run src/lib/recognition/recognize-sheet.test.ts`
Expected: PASS

- [ ] **Step 5: Добавить интеграционный тест (пропускается без ключа/фикстуры) `src/lib/recognition/recognize-sheet.integration.test.ts`**

```ts
import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { recognizeSheet } from './recognize-sheet';
import type { CatalogEntry } from './match-product';

const FIXTURE = join(__dirname, '__fixtures__', 'pies-sheet.jpg');
const hasKey = !!process.env.ANTHROPIC_API_KEY;
const hasFixture = existsSync(FIXTURE);

const catalog: CatalogEntry[] = [
  { id: 'p1', name: 'Самса' },
  { id: 'p2', name: 'Пицца открытая' },
];

describe.skipIf(!hasKey || !hasFixture)('recognizeSheet (реальный API)', () => {
  it('распознаёт реальный лист пирогов', async () => {
    const data = readFileSync(FIXTURE).toString('base64');
    const res = await recognizeSheet({
      image: { kind: 'base64', mediaType: 'image/jpeg', data },
      catalog,
      sheetType: 'pies',
    });
    expect(res.sheetType).toBe('pies');
    expect(res.rows.length).toBeGreaterThan(0);
  }, 60_000);
});
```

- [ ] **Step 6: Прогнать весь набор и проверить типы**

Run: `cd /Users/nkola/bakery-ops && npm test && npx tsc --noEmit`
Expected: все тесты PASS (интеграционный — `skipped`), tsc без ошибок.

- [ ] **Step 7: Коммит**

```bash
cd /Users/nkola/bakery-ops
git add src/lib/recognition/recognize-sheet.ts src/lib/recognition/recognize-sheet.test.ts src/lib/recognition/recognize-sheet.integration.test.ts
git commit -m "feat(recognition): recognizeSheet — vision-распознавание с инъекцией клиента + интеграц. тест"
```

---

## Калибровка на реальных листах (вне TDD)

Чтобы прогнать интеграционный тест и настроить промпт: положить фото листа в `src/lib/recognition/__fixtures__/pies-sheet.jpg`, задать `ANTHROPIC_API_KEY` в `.env`, запустить `npm test`. Свободную рукопись (кондитерка, `confectionery_freeform`) калибруем отдельно — точность ниже, ждём больше правок.

## Дальнейшие планы

- **Plan 3 — Capture & Confirm:** миграция БД + репозитории (upsert movements, дедуп листов по imageHash), Telegram-webhook + веб-загрузка, ревью-UI с подсветкой неуверенных ячеек и «Остатка», обработка `unknownLines`, NextAuth.
- **Plan 4 — Dashboard & Aging:** остатки/продажи/списания + блок «залежалось» (Точка 2) на `computeAging`.

## Self-review (выполнено при написании)

- **Покрытие спеки §6:** мастер-каталог в промпте (Task 4), structured output по схеме (Task 1), уверенность по сопоставлению (Task 2), сырой текст ячеек сохраняется в `ParsedQuantity.raw` (через `parseQuantity`), `unknownLines` для дописанных строк (Task 3) — есть.
- **Плейсхолдеры:** нет — полный код и команды в каждом шаге.
- **Согласованность типов:** `CatalogEntry` определён в Task 2, используется в Tasks 3–5; `RawRecognition`/`RecognitionResult` из Task 1 используются в Tasks 3, 5; `recognizeSheet`/`normalizeRecognition`/`matchProductToCatalog`/`buildRecognitionPrompt` единообразны между тестами и реализациями; `parseQuantity` принимает `string | null | undefined` (обновлено в Plan 1) — совместимо с `RawCell` полями `string | null`.
- **Изоляция сети:** единственный сетевой вызов в `recognizeSheet` за инъектируемым клиентом; всё остальное — чистые функции, тестируются без API.

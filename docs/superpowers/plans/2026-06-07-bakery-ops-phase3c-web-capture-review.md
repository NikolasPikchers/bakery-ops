# Bakery Ops — Phase 3c: Web Capture & Review Loop — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the bakery service usable end-to-end on the web: log in, upload a paper sheet photo, see it recognized, edit/confirm the numbers, and have real movements persisted.

**Architecture:** Next.js App Router routes/pages layered on top of the already-tested engine (`ingestSheetPhoto`, `persistRecognition`, `recognizeSheet`). Auth.js v5 Credentials (shared password) gates the app via middleware; API routes self-guard with `auth()`. A web upload route streams the photo through the existing ingest pipeline; a review page renders an editable grid that highlights the «Остаток» column and low-confidence cells, then writes manual edits (recomputing `soldCalc`) and flips the sheet to `confirmed`.

**Tech Stack:** Next.js 16 (App Router, RSC), React 19, TypeScript, Auth.js v5 (`next-auth@^5`), Prisma 7 (driver adapter, `getPrisma()`), Vercel Blob, OpenRouter (`recognizeSheet`), Vitest.

**Out of scope (separate plans):** Telegram bot (Plan 3d), dashboard + aging surfaces (Plan 4), catalog admin CRUD (Plan 4). Plan 3c includes a *read* of the catalog from DB but no admin UI.

---

## Decisions locked for this plan

- **Auth:** one shared password in env `APP_PASSWORD`, checked by an Auth.js Credentials provider; JWT session; `AUTH_SECRET` env. No DB user table in Phase 1. Pages protected by `middleware.ts`; API routes call `auth()` and 401 on no session. `/api/auth/*` and (future) `/api/telegram` are excluded from the page matcher.
- **Point identity:** seeded points have deterministic ids `point-1` / `point-2` (see `prisma/seed.ts`). The UI offers exactly these two. Catalog scope maps `point-1 → point1`, `point-2 → point2`, always including `both`.
- **IDs:** sheet ids generated with `crypto.randomUUID()` (used as both Blob key and DB id).
- **Runtime:** every route that touches Prisma/Blob/Buffer sets `export const runtime = 'nodejs'`.
- **Next 16 params:** dynamic route `params` is a `Promise` — always `await params`.
- **Unknown lines (freeform handwriting not in catalog):** Phase 3c supports only `map` (set `status=mapped` + `mappedProductId`, no auto-movement) and `ignore` (`status=ignored`). Auto-creating movements from freeform text is deferred — noted as a known limitation.

---

## File Structure

**New — lib (unit-tested):**
- `src/lib/db/catalog-repo.ts` — load `CatalogEntry[]` from `Product` for a `(sheetType, pointId)`.
- `src/lib/http/upload-input.ts` — pure parse/validate of the upload form fields.
- `src/lib/http/sheet-actions.ts` — pure parse/validate of the sheet PATCH body (discriminated union).
- `src/lib/db/sheet-view.ts` — load everything the review page needs for one sheet.
- `src/lib/db/apply-edits.ts` — apply manual movement edits + recompute `soldCalc`; confirm a sheet.
- `src/lib/ingest/deps.ts` — factory wiring real `IngestDeps` (blob/recognize/db/newId).

**New — app (verified by build + preview):**
- `src/auth.ts` — Auth.js config + exported `handlers`, `auth`, `signIn`, `signOut`.
- `src/middleware.ts` — page protection.
- `src/app/api/auth/[...nextauth]/route.ts` — Auth.js route handlers.
- `src/app/login/page.tsx` — password login form (client).
- `src/app/upload/page.tsx` — upload form (client).
- `src/app/api/upload/route.ts` — POST: ingest a photo.
- `src/app/sheets/[id]/page.tsx` — review page (server).
- `src/app/sheets/[id]/ReviewTable.tsx` — editable grid (client).
- `src/app/api/sheets/[id]/route.ts` — PATCH: save edits / confirm / map|ignore unknown lines.
- `src/app/ui.module.css` — shared minimal styles for new pages.

**Modified:**
- `src/app/layout.tsx` — ru lang, app title, top nav + sign-out.
- `src/app/page.tsx` — replace boilerplate with home (links + recent sheets).
- `.env` — add `AUTH_SECRET`, `APP_PASSWORD` (local; mirror in Vercel during Task 14).
- `package.json` — add `next-auth@^5`.

---

## Task 1: Catalog loader from DB

**Files:**
- Create: `src/lib/db/catalog-repo.ts`
- Test: `src/lib/db/catalog-repo.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/db/catalog-repo.test.ts
import { describe, it, expect } from 'vitest';
import { scopeForPoint, loadCatalog } from './catalog-repo';

describe('scopeForPoint', () => {
  it('maps seeded point ids to scope keys', () => {
    expect(scopeForPoint('point-1')).toBe('point1');
    expect(scopeForPoint('point-2')).toBe('point2');
  });
  it('throws on unknown point', () => {
    expect(() => scopeForPoint('nope')).toThrow();
  });
});

describe('loadCatalog', () => {
  it('queries active products by sheetType + scope (both | point scope) and maps to CatalogEntry', async () => {
    let received: unknown;
    const fakePrisma = {
      product: {
        findMany: async (args: unknown) => {
          received = args;
          return [
            { id: 'a', name: 'Самса', aliases: [] },
            { id: 'b', name: 'Пирожок с капустой', aliases: ['Пирожок (беккен) с капустой'] },
          ];
        },
      },
    };
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const out = await loadCatalog(fakePrisma as any, 'pies', 'point-1');
    expect(received).toEqual({
      where: { active: true, sheetType: 'pies', pointScope: { in: ['both', 'point1'] } },
      select: { id: true, name: true, aliases: true },
      orderBy: { name: 'asc' },
    });
    expect(out).toEqual([
      { id: 'a', name: 'Самса', aliases: [] },
      { id: 'b', name: 'Пирожок с капустой', aliases: ['Пирожок (беккен) с капустой'] },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/db/catalog-repo.test.ts`
Expected: FAIL — cannot find module `./catalog-repo`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/db/catalog-repo.ts
import type { PrismaClient } from '@prisma/client';
import type { SheetType } from '@/lib/domain/types';
import type { CatalogEntry } from '@/lib/recognition/match-product';

type CatalogClient = Pick<PrismaClient, 'product'>;
type ScopeKey = 'point1' | 'point2';

/** Сид задаёт точкам детерминированные id point-1 / point-2 (prisma/seed.ts). */
export function scopeForPoint(pointId: string): ScopeKey {
  if (pointId === 'point-1') return 'point1';
  if (pointId === 'point-2') return 'point2';
  throw new Error(`Unknown point id: ${pointId}`);
}

/** Каталог для (тип листа, точка): активные SKU нужного типа, чья область — both или точка. */
export async function loadCatalog(
  prisma: CatalogClient,
  sheetType: SheetType,
  pointId: string,
): Promise<CatalogEntry[]> {
  const scope = scopeForPoint(pointId);
  const rows = await prisma.product.findMany({
    where: { active: true, sheetType, pointScope: { in: ['both', scope] } },
    select: { id: true, name: true, aliases: true },
    orderBy: { name: 'asc' },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, aliases: r.aliases }));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/db/catalog-repo.test.ts`
Expected: PASS (2 files? no — 1 file, 4 assertions across 3 tests). All green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/catalog-repo.ts src/lib/db/catalog-repo.test.ts
git commit -m "feat(db): загрузка каталога из БД по (тип листа, точка)"
```

---

## Task 2: Upload form input parser (pure)

**Files:**
- Create: `src/lib/http/upload-input.ts`
- Test: `src/lib/http/upload-input.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/http/upload-input.test.ts
import { describe, it, expect } from 'vitest';
import { parseUploadFields } from './upload-input';

const file = (type: string) => ({ type, name: 'x' }) as File;

describe('parseUploadFields', () => {
  it('accepts a valid point/type/file triple', () => {
    const r = parseUploadFields({ pointId: 'point-1', sheetType: 'pies', file: file('image/jpeg') });
    expect(r).toEqual({ ok: true, value: { pointId: 'point-1', sheetType: 'pies', mediaType: 'image/jpeg' } });
  });
  it('rejects an unknown point', () => {
    const r = parseUploadFields({ pointId: 'x', sheetType: 'pies', file: file('image/jpeg') });
    expect(r.ok).toBe(false);
  });
  it('rejects an unknown sheet type', () => {
    const r = parseUploadFields({ pointId: 'point-1', sheetType: 'bread', file: file('image/jpeg') });
    expect(r.ok).toBe(false);
  });
  it('rejects an unsupported media type', () => {
    const r = parseUploadFields({ pointId: 'point-1', sheetType: 'pies', file: file('application/pdf') });
    expect(r.ok).toBe(false);
  });
  it('rejects a missing file', () => {
    const r = parseUploadFields({ pointId: 'point-1', sheetType: 'pies', file: null });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/http/upload-input.test.ts`
Expected: FAIL — cannot find module `./upload-input`.

- [ ] **Step 3: Write minimal implementation**

```ts
// src/lib/http/upload-input.ts
import { SHEET_TYPES } from '@/lib/recognition/schema';
import type { SheetType } from '@/lib/domain/types';

const POINTS = ['point-1', 'point-2'] as const;
const MEDIA = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type UploadMediaType = (typeof MEDIA)[number];

export type ParsedUpload = { pointId: string; sheetType: SheetType; mediaType: UploadMediaType };
export type ParseResult =
  | { ok: true; value: ParsedUpload }
  | { ok: false; error: string };

export function parseUploadFields(input: {
  pointId: unknown;
  sheetType: unknown;
  file: { type: string } | null;
}): ParseResult {
  if (!POINTS.includes(input.pointId as (typeof POINTS)[number]))
    return { ok: false, error: 'Неизвестная точка' };
  if (!SHEET_TYPES.includes(input.sheetType as SheetType))
    return { ok: false, error: 'Неизвестный тип листа' };
  if (!input.file) return { ok: false, error: 'Нет файла' };
  if (!MEDIA.includes(input.file.type as UploadMediaType))
    return { ok: false, error: 'Поддерживаются только JPEG/PNG/WebP' };
  return {
    ok: true,
    value: {
      pointId: input.pointId as string,
      sheetType: input.sheetType as SheetType,
      mediaType: input.file.type as UploadMediaType,
    },
  };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/http/upload-input.test.ts`
Expected: PASS — 5 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/http/upload-input.ts src/lib/http/upload-input.test.ts
git commit -m "feat(http): валидация полей веб-загрузки листа"
```

---

## Task 3: Ingest deps factory (real wiring)

**Files:**
- Create: `src/lib/ingest/deps.ts`

This wires the real `IngestDeps` for routes. No new unit test (it is pure wiring of already-tested units; verified by `tsc` and by Task 6's route working in preview).

- [ ] **Step 1: Write the implementation**

```ts
// src/lib/ingest/deps.ts
import { getPrisma } from '@/lib/db/client';
import { vercelBlobStore } from '@/lib/storage/blob';
import { recognizeSheet } from '@/lib/recognition/recognize-sheet';
import { persistRecognition } from '@/lib/db/persist-recognition';
import { findSheetByImageHash } from '@/lib/db/movements-repo';
import type { IngestDeps } from './ingest-sheet';

/** Боевые зависимости пайплайна для серверных маршрутов. Тесты используют свои стабы. */
export function buildIngestDeps(): IngestDeps {
  const prisma = getPrisma();
  return {
    blob: vercelBlobStore,
    recognize: (args) => recognizeSheet(args),
    findSheetByHash: (hash) => findSheetByImageHash(prisma, hash),
    persist: (records) => persistRecognition(prisma, records),
    newId: () => crypto.randomUUID(),
  };
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit`
Expected: no errors. (`recognizeSheet`'s input type structurally matches `IngestDeps.recognize`'s arg; `findSheetByImageHash` returns `{ id } | null`.)

- [ ] **Step 3: Commit**

```bash
git add src/lib/ingest/deps.ts
git commit -m "feat(ingest): фабрика боевых зависимостей пайплайна"
```

---

## Task 4: Auth.js v5 setup + middleware

**Files:**
- Modify: `package.json` (add `next-auth@^5`)
- Create: `src/auth.ts`
- Create: `src/app/api/auth/[...nextauth]/route.ts`
- Create: `src/middleware.ts`
- Modify: `.env` (add `AUTH_SECRET`, `APP_PASSWORD`)

- [ ] **Step 1: Install Auth.js**

Run: `npm install next-auth@^5`
If peer-deps conflict with Next 16 / React 19: `npm install next-auth@^5 --legacy-peer-deps`
Expected: `next-auth` appears in `package.json` dependencies.

- [ ] **Step 2: Add local env vars**

Generate a secret and append to `.env` (do NOT commit `.env` — it is gitignored):

```bash
printf '\nAUTH_SECRET=%s\nAPP_PASSWORD=%s\n' "$(openssl rand -base64 32)" "bakery-2026" >> .env
```

Expected: `.env` now contains `AUTH_SECRET=...` and `APP_PASSWORD=bakery-2026`. (Real password chosen with the user in Task 14; `bakery-2026` is a local placeholder.)

- [ ] **Step 3: Write the Auth.js config**

```ts
// src/auth.ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { password: { label: 'Пароль', type: 'password' } },
      authorize: (creds) => {
        const password = typeof creds?.password === 'string' ? creds.password : '';
        const expected = process.env.APP_PASSWORD ?? '';
        if (expected.length > 0 && password === expected) {
          return { id: 'owner', name: 'Пекарня' };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    authorized: ({ auth }) => !!auth,
  },
});
```

- [ ] **Step 4: Write the route handler**

```ts
// src/app/api/auth/[...nextauth]/route.ts
import { handlers } from '@/auth';

export const { GET, POST } = handlers;
```

- [ ] **Step 5: Write the middleware**

```ts
// src/middleware.ts
export { auth as middleware } from '@/auth';

// Защищаем страницы. Исключаем next-auth, будущий телеграм-вебхук, статику и саму /login.
// Прочие API-маршруты сами вызывают auth() и отдают 401.
export const config = {
  matcher: ['/((?!api/auth|api/telegram|login|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 6: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: build succeeds, `/api/auth/[...nextauth]` route compiled, no type errors.

- [ ] **Step 7: Commit**

```bash
git add package.json package-lock.json src/auth.ts src/app/api/auth src/middleware.ts
git commit -m "feat(auth): Auth.js v5 (общий пароль) + защита страниц middleware"
```

---

## Task 5: Login page

**Files:**
- Create: `src/app/login/page.tsx`
- Create: `src/app/ui.module.css`

- [ ] **Step 1: Write shared styles**

```css
/* src/app/ui.module.css */
.shell { max-width: 960px; margin: 0 auto; padding: 24px 20px; font-family: var(--font-geist-sans), system-ui, sans-serif; }
.nav { display: flex; gap: 16px; align-items: center; padding: 12px 20px; border-bottom: 1px solid #eee; }
.nav a { color: #111; text-decoration: none; font-weight: 600; }
.spacer { flex: 1; }
.card { max-width: 360px; margin: 64px auto; padding: 24px; border: 1px solid #eee; border-radius: 12px; }
.field { display: flex; flex-direction: column; gap: 6px; margin-bottom: 14px; }
.field label { font-size: 13px; color: #555; }
.field input, .field select { padding: 10px; border: 1px solid #ccc; border-radius: 8px; font-size: 15px; }
.btn { padding: 10px 16px; border: 0; border-radius: 8px; background: #111; color: #fff; font-size: 15px; cursor: pointer; }
.btn:disabled { opacity: 0.5; cursor: default; }
.btnGhost { background: #fff; color: #111; border: 1px solid #ccc; }
.error { color: #b00020; font-size: 14px; margin: 8px 0; }
.badge { display: inline-block; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 600; }
.badgeReview { background: #fff3cd; color: #7a5b00; }
.badgeConfirmed { background: #d4edda; color: #155724; }
.badgeRecognized { background: #e2e3ff; color: #2a2a7a; }
.table { border-collapse: collapse; width: 100%; font-size: 14px; }
.table th, .table td { border: 1px solid #e3e3e3; padding: 6px 8px; text-align: center; }
.table th { background: #fafafa; }
.cellOstatok { background: #fffbe6; }
.cellLow { outline: 2px solid #ffb300; outline-offset: -2px; }
.cellInput { width: 56px; padding: 4px; text-align: center; border: 1px solid #ccc; border-radius: 6px; }
.raw { display: block; font-size: 11px; color: #999; margin-top: 2px; min-height: 13px; }
.rowName { text-align: left; font-weight: 600; white-space: nowrap; }
.unmatched { color: #b00020; }
```

- [ ] **Step 2: Write the login page**

```tsx
// src/app/login/page.tsx
'use client';

import { useState } from 'react';
import { signIn } from 'next-auth/react';
import { useRouter, useSearchParams } from 'next/navigation';
import styles from '../ui.module.css';

export default function LoginPage() {
  const router = useRouter();
  const params = useSearchParams();
  const callbackUrl = params.get('callbackUrl') ?? '/';
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError('');
    const res = await signIn('credentials', { password, redirect: false });
    setBusy(false);
    if (res?.error) {
      setError('Неверный пароль');
      return;
    }
    router.push(callbackUrl);
    router.refresh();
  }

  return (
    <div className={styles.card}>
      <h1>Bakery Ops</h1>
      <form onSubmit={submit}>
        <div className={styles.field}>
          <label htmlFor="pw">Пароль</label>
          <input
            id="pw"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <button className={styles.btn} disabled={busy || password.length === 0}>
          {busy ? 'Вход…' : 'Войти'}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: succeeds; `/login` is a client page.

- [ ] **Step 4: Preview verification**

- `preview_start` (dev server). It loads `.env`? Next dev loads `.env` automatically. Ensure `.env` has AUTH_SECRET + APP_PASSWORD (Task 4 Step 2).
- `preview_eval`: `window.location.href` after navigating to `/` → expect redirect to `/login?callbackUrl=...`.
- `preview_fill` the password with `bakery-2026`, `preview_click` "Войти".
- `preview_snapshot` → expect we are off `/login` (home content).
- `preview_screenshot` the logged-in home (proof).

If redirect/login fails, read `preview_console_logs` + `preview_logs`, fix `src/auth.ts`/`middleware.ts`, repeat.

- [ ] **Step 5: Commit**

```bash
git add src/app/login/page.tsx src/app/ui.module.css
git commit -m "feat(auth): страница входа по паролю"
```

---

## Task 6: App shell — layout + home

**Files:**
- Modify: `src/app/layout.tsx`
- Modify: `src/app/page.tsx`
- Delete: `src/app/page.module.css` (boilerplate, no longer referenced)

- [ ] **Step 1: Rewrite the layout**

```tsx
// src/app/layout.tsx
import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import Link from 'next/link';
import { auth, signOut } from '@/auth';
import styles from './ui.module.css';
import './globals.css';

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin', 'cyrillic'] });
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'Bakery Ops',
  description: 'Учёт движения товара пекарни',
};

export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const session = await auth();
  return (
    <html lang="ru" className={`${geistSans.variable} ${geistMono.variable}`}>
      <body>
        {session && (
          <nav className={styles.nav}>
            <Link href="/">Остатки</Link>
            <Link href="/upload">Загрузить лист</Link>
            <span className={styles.spacer} />
            <form
              action={async () => {
                'use server';
                await signOut({ redirectTo: '/login' });
              }}
            >
              <button className={`${styles.btn} ${styles.btnGhost}`}>Выйти</button>
            </form>
          </nav>
        )}
        {children}
      </body>
    </html>
  );
}
```

- [ ] **Step 2: Rewrite the home page (recent sheets)**

```tsx
// src/app/page.tsx
import Link from 'next/link';
import { getPrisma } from '@/lib/db/client';
import styles from './ui.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS_LABEL: Record<string, string> = {
  uploaded: 'Загружен',
  recognized: 'Распознан',
  needs_review: 'На проверке',
  confirmed: 'Подтверждён',
};

function badgeClass(status: string): string {
  if (status === 'confirmed') return styles.badgeConfirmed;
  if (status === 'needs_review') return styles.badgeReview;
  return styles.badgeRecognized;
}

export default async function Home() {
  const prisma = getPrisma();
  const sheets = await prisma.sheet.findMany({
    orderBy: { createdAt: 'desc' },
    take: 20,
    include: { point: true },
  });

  return (
    <main className={styles.shell}>
      <h1>Листы</h1>
      <p>
        <Link className={styles.btn} href="/upload">
          + Загрузить лист
        </Link>
      </p>
      {sheets.length === 0 ? (
        <p>Пока нет загруженных листов.</p>
      ) : (
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Дата</th>
              <th>Точка</th>
              <th>Тип</th>
              <th>Статус</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {sheets.map((s) => (
              <tr key={s.id}>
                <td>{s.createdAt.toISOString().slice(0, 10)}</td>
                <td>{s.point.name}</td>
                <td>{s.sheetType}</td>
                <td>
                  <span className={`${styles.badge} ${badgeClass(s.status)}`}>
                    {STATUS_LABEL[s.status] ?? s.status}
                  </span>
                </td>
                <td>
                  <Link href={`/sheets/${s.id}`}>Открыть</Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Remove boilerplate CSS**

Run: `git rm src/app/page.module.css`
Expected: file removed; `page.tsx` no longer imports it.

- [ ] **Step 4: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: succeeds; no reference to deleted `page.module.css`.

- [ ] **Step 5: Preview verification**

- Reload preview at `/` (logged in from Task 5). `preview_snapshot` → expect nav ("Остатки", "Загрузить лист", "Выйти") + "Листы" heading + empty state or seeded test sheets.
- `preview_screenshot` (proof of authenticated shell).

- [ ] **Step 6: Commit**

```bash
git add src/app/layout.tsx src/app/page.tsx
git commit -m "feat(ui): каркас приложения — навигация, выход, список листов"
```

---

## Task 7: Upload API route

**Files:**
- Create: `src/app/api/upload/route.ts`

No new unit test (parsing logic is Task 2, already tested; the route is thin wiring verified in preview). 

- [ ] **Step 1: Write the route**

```ts
// src/app/api/upload/route.ts
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { loadCatalog } from '@/lib/db/catalog-repo';
import { parseUploadFields } from '@/lib/http/upload-input';
import { ingestSheetPhoto } from '@/lib/ingest/ingest-sheet';
import { buildIngestDeps } from '@/lib/ingest/deps';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST(req: Request) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const form = await req.formData();
  const fileEntry = form.get('file');
  const file = fileEntry instanceof File ? fileEntry : null;
  const parsed = parseUploadFields({
    pointId: form.get('pointId'),
    sheetType: form.get('sheetType'),
    file: file ? { type: file.type } : null,
  });
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });
  if (!file) return Response.json({ error: 'Нет файла' }, { status: 400 });

  const bytes = new Uint8Array(await file.arrayBuffer());
  const catalog = await loadCatalog(getPrisma(), parsed.value.sheetType, parsed.value.pointId);

  try {
    const result = await ingestSheetPhoto(
      {
        bytes,
        mediaType: parsed.value.mediaType,
        pointId: parsed.value.pointId,
        sheetType: parsed.value.sheetType,
        source: 'web',
        uploadedBy: session.user?.name ?? null,
        catalog,
      },
      buildIngestDeps(),
    );
    return Response.json(result);
  } catch (err) {
    console.error('upload ingest failed', err);
    return Response.json({ error: 'Не удалось распознать лист' }, { status: 502 });
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: succeeds; `/api/upload` listed as a Node route.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/upload/route.ts
git commit -m "feat(api): маршрут веб-загрузки листа поверх ingestSheetPhoto"
```

---

## Task 8: Upload page

**Files:**
- Create: `src/app/upload/page.tsx`

- [ ] **Step 1: Write the upload page**

```tsx
// src/app/upload/page.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../ui.module.css';

export default function UploadPage() {
  const router = useRouter();
  const [pointId, setPointId] = useState('point-1');
  const [sheetType, setSheetType] = useState('pies');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!file) {
      setError('Выберите фото листа');
      return;
    }
    setBusy(true);
    setError('');
    const fd = new FormData();
    fd.set('pointId', pointId);
    fd.set('sheetType', sheetType);
    fd.set('file', file);
    const res = await fetch('/api/upload', { method: 'POST', body: fd });
    const data = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(data.error ?? 'Ошибка загрузки');
      return;
    }
    router.push(`/sheets/${data.sheetId}`);
  }

  return (
    <main className={styles.shell}>
      <h1>Загрузить лист</h1>
      <form onSubmit={submit} style={{ maxWidth: 420 }}>
        <div className={styles.field}>
          <label>Точка</label>
          <select value={pointId} onChange={(e) => setPointId(e.target.value)}>
            <option value="point-1">Точка 1</option>
            <option value="point-2">Точка 2</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>Тип листа</label>
          <select value={sheetType} onChange={(e) => setSheetType(e.target.value)}>
            <option value="pies">Пироги/выпечка</option>
            <option value="desserts">Десерты</option>
            <option value="confectionery_freeform">Кондитерка (рукопись)</option>
          </select>
        </div>
        <div className={styles.field}>
          <label>Фото листа</label>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
        </div>
        {error && <div className={styles.error}>{error}</div>}
        <button className={styles.btn} disabled={busy}>
          {busy ? 'Распознаю…' : 'Загрузить и распознать'}
        </button>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: succeeds.

- [ ] **Step 3: Preview verification (real e2e — needs a sheet photo)**

- Ensure a test photo exists. If `src/lib/recognition/__fixtures__/` has a real sheet jpg, copy it to a path you can upload from the browser file picker is not scriptable; instead verify the *form* renders and validation works, then do the true e2e via `fetch` in `preview_eval`:
  - `preview_eval` a script that builds a `FormData` from a fetched fixture blob and POSTs to `/api/upload`, logging the JSON. (Requires the dev server to have live `.env`: DATABASE_URL, OPENROUTER_API_KEY, BLOB_READ_WRITE_TOKEN — all present in `.env`.)
  - Example eval: `const r = await fetch('/api/upload', {method:'POST', body: fd}); return await r.json();` after constructing `fd` with a small base64 image blob. Expect `{ sheetId, status }`.
- If no real fixture is available, at minimum `preview_snapshot` the form and confirm selects + file input render; full recognition accuracy is validated in Task 13's e2e or by the user uploading a real photo.
- `preview_screenshot` the upload form (proof).

- [ ] **Step 4: Commit**

```bash
git add src/app/upload/page.tsx
git commit -m "feat(ui): страница веб-загрузки листа"
```

---

## Task 9: Sheet view loader

**Files:**
- Create: `src/lib/db/sheet-view.ts`
- Test: `src/lib/db/sheet-view.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/db/sheet-view.test.ts
import { describe, it, expect } from 'vitest';
import { buildSheetView, type RawSheetData } from './sheet-view';

const data: RawSheetData = {
  sheet: {
    id: 's1',
    pointId: 'point-1',
    sheetType: 'pies',
    imageUrl: 'http://blob/x.jpg',
    dates: [new Date('2026-06-05'), new Date('2026-06-06')],
    status: 'needs_review',
    point: { name: 'Точка 1' },
  },
  movements: [
    {
      productId: 'p1',
      date: new Date('2026-06-05'),
      prihod: 24,
      ostatok: 9,
      spisanie: 0,
      soldCalc: null,
      confidence: 0.6,
      rawCell: { prihod: '24', ostatok: '9', spisanie: '' },
      product: { name: 'Самса' },
    },
    {
      productId: 'p1',
      date: new Date('2026-06-06'),
      prihod: 8,
      ostatok: 2,
      spisanie: 0,
      soldCalc: 15,
      confidence: 0.95,
      rawCell: { prihod: '8', ostatok: '2', spisanie: '' },
      product: { name: 'Самса' },
    },
  ],
  unknownLines: [{ id: 'u1', rawText: 'Эклер 5', status: 'pending', mappedProductId: null }],
  products: [{ id: 'p1', name: 'Самса' }],
};

describe('buildSheetView', () => {
  it('pivots movements into product rows × date columns with raw + confidence', () => {
    const v = buildSheetView(data);
    expect(v.dates).toEqual(['2026-06-05', '2026-06-06']);
    expect(v.rows).toHaveLength(1);
    const row = v.rows[0];
    expect(row.productId).toBe('p1');
    expect(row.productName).toBe('Самса');
    expect(row.cells['2026-06-05']).toEqual({
      prihod: 24,
      ostatok: 9,
      spisanie: 0,
      soldCalc: null,
      confidence: 0.6,
      raw: { prihod: '24', ostatok: '9', spisanie: '' },
      low: true,
    });
    expect(row.cells['2026-06-06'].low).toBe(false);
  });

  it('marks low confidence below 0.8', () => {
    const v = buildSheetView(data);
    expect(v.rows[0].cells['2026-06-05'].low).toBe(true);
  });

  it('passes through unknown lines and products', () => {
    const v = buildSheetView(data);
    expect(v.unknownLines).toEqual([{ id: 'u1', rawText: 'Эклер 5', status: 'pending', mappedProductId: null }]);
    expect(v.products).toEqual([{ id: 'p1', name: 'Самса' }]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/db/sheet-view.test.ts`
Expected: FAIL — cannot find module `./sheet-view`.

- [ ] **Step 3: Write the loader + pure pivot**

```ts
// src/lib/db/sheet-view.ts
import type { PrismaClient } from '@prisma/client';
import type { SheetType } from '@/lib/domain/types';
import { scopeForPoint } from './catalog-repo';

export const LOW_CONFIDENCE = 0.8;

type RawCell = { prihod: string; ostatok: string; spisanie: string };

export type RawSheetData = {
  sheet: {
    id: string;
    pointId: string;
    sheetType: SheetType;
    imageUrl: string;
    dates: Date[];
    status: string;
    point: { name: string };
  };
  movements: Array<{
    productId: string;
    date: Date;
    prihod: number | null;
    ostatok: number | null;
    spisanie: number | null;
    soldCalc: number | null;
    confidence: number | null;
    rawCell: RawCell | null;
    product: { name: string };
  }>;
  unknownLines: Array<{ id: string; rawText: string; status: string; mappedProductId: string | null }>;
  products: Array<{ id: string; name: string }>;
};

export type ViewCell = {
  prihod: number | null;
  ostatok: number | null;
  spisanie: number | null;
  soldCalc: number | null;
  confidence: number | null;
  raw: RawCell | null;
  low: boolean;
};
export type ViewRow = {
  productId: string;
  productName: string;
  cells: Record<string, ViewCell>;
};
export type SheetView = {
  sheetId: string;
  pointId: string;
  pointName: string;
  sheetType: SheetType;
  imageUrl: string;
  status: string;
  dates: string[];
  rows: ViewRow[];
  unknownLines: RawSheetData['unknownLines'];
  products: RawSheetData['products'];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Чистый pivot: движения → строки товаров × колонки дат. */
export function buildSheetView(data: RawSheetData): SheetView {
  const dates = data.sheet.dates.map(iso).sort();
  const byProduct = new Map<string, ViewRow>();
  for (const m of data.movements) {
    let row = byProduct.get(m.productId);
    if (!row) {
      row = { productId: m.productId, productName: m.product.name, cells: {} };
      byProduct.set(m.productId, row);
    }
    const conf = m.confidence ?? 1;
    row.cells[iso(m.date)] = {
      prihod: m.prihod,
      ostatok: m.ostatok,
      spisanie: m.spisanie,
      soldCalc: m.soldCalc,
      confidence: m.confidence,
      raw: m.rawCell,
      low: conf < LOW_CONFIDENCE,
    };
  }
  const rows = [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName));
  return {
    sheetId: data.sheet.id,
    pointId: data.sheet.pointId,
    pointName: data.sheet.point.name,
    sheetType: data.sheet.sheetType,
    imageUrl: data.sheet.imageUrl,
    status: data.sheet.status,
    dates,
    rows,
    unknownLines: data.unknownLines,
    products: data.products,
  };
}

/** Загрузка из БД + pivot. Возвращает null, если листа нет. */
export async function loadSheetView(prisma: PrismaClient, sheetId: string): Promise<SheetView | null> {
  const sheet = await prisma.sheet.findUnique({
    where: { id: sheetId },
    include: { point: { select: { name: true } } },
  });
  if (!sheet) return null;

  const [movements, unknownLines, products] = await Promise.all([
    prisma.movement.findMany({
      where: { sheetId },
      include: { product: { select: { name: true } } },
      orderBy: [{ productId: 'asc' }, { date: 'asc' }],
    }),
    prisma.unknownLine.findMany({
      where: { sheetId },
      select: { id: true, rawText: true, status: true, mappedProductId: true },
    }),
    prisma.product.findMany({
      where: {
        active: true,
        sheetType: sheet.sheetType,
        pointScope: { in: ['both', scopeForPoint(sheet.pointId)] },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return buildSheetView({
    sheet: {
      id: sheet.id,
      pointId: sheet.pointId,
      sheetType: sheet.sheetType,
      imageUrl: sheet.imageUrl,
      dates: sheet.dates,
      status: sheet.status,
      point: { name: sheet.point.name },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    movements: movements.map((m: any) => ({
      productId: m.productId,
      date: m.date,
      prihod: m.prihod,
      ostatok: m.ostatok,
      spisanie: m.spisanie,
      soldCalc: m.soldCalc,
      confidence: m.confidence,
      rawCell: m.rawCell as RawCell | null,
      product: { name: m.product.name },
    })),
    unknownLines,
    products,
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/db/sheet-view.test.ts`
Expected: PASS — 3 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/sheet-view.ts src/lib/db/sheet-view.test.ts
git commit -m "feat(db): загрузка и pivot листа для ревью-UI"
```

---

## Task 10: Sheet PATCH body parser (pure)

**Files:**
- Create: `src/lib/http/sheet-actions.ts`
- Test: `src/lib/http/sheet-actions.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/http/sheet-actions.test.ts
import { describe, it, expect } from 'vitest';
import { parseSheetAction } from './sheet-actions';

describe('parseSheetAction', () => {
  it('parses a save action with edits', () => {
    const r = parseSheetAction({
      action: 'save',
      edits: [
        { productId: 'p1', date: '2026-06-05', prihod: 24, ostatok: 9, spisanie: null },
        { productId: 'p1', date: '2026-06-06', prihod: null, ostatok: 2, spisanie: 0 },
      ],
    });
    expect(r.ok).toBe(true);
    if (r.ok && r.value.action === 'save') expect(r.value.edits).toHaveLength(2);
  });
  it('parses a confirm action', () => {
    const r = parseSheetAction({ action: 'confirm' });
    expect(r).toEqual({ ok: true, value: { action: 'confirm' } });
  });
  it('parses mapUnknown / ignoreUnknown', () => {
    expect(parseSheetAction({ action: 'mapUnknown', id: 'u1', productId: 'p1' }).ok).toBe(true);
    expect(parseSheetAction({ action: 'ignoreUnknown', id: 'u1' }).ok).toBe(true);
  });
  it('rejects unknown action', () => {
    expect(parseSheetAction({ action: 'nuke' }).ok).toBe(false);
  });
  it('rejects a save edit with a non-integer quantity', () => {
    const r = parseSheetAction({
      action: 'save',
      edits: [{ productId: 'p1', date: '2026-06-05', prihod: 1.5, ostatok: null, spisanie: null }],
    });
    expect(r.ok).toBe(false);
  });
  it('rejects a save edit with a bad date', () => {
    const r = parseSheetAction({
      action: 'save',
      edits: [{ productId: 'p1', date: '05.06.2026', prihod: 1, ostatok: null, spisanie: null }],
    });
    expect(r.ok).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/http/sheet-actions.test.ts`
Expected: FAIL — cannot find module `./sheet-actions`.

- [ ] **Step 3: Write the parser with zod**

```ts
// src/lib/http/sheet-actions.ts
import { z } from 'zod';

const qty = z.number().int().nullable();
const editSchema = z.object({
  productId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  prihod: qty,
  ostatok: qty,
  spisanie: qty,
});

export type MovementEdit = z.infer<typeof editSchema>;

const actionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('save'), edits: z.array(editSchema).min(1) }),
  z.object({ action: z.literal('confirm') }),
  z.object({ action: z.literal('mapUnknown'), id: z.string().min(1), productId: z.string().min(1) }),
  z.object({ action: z.literal('ignoreUnknown'), id: z.string().min(1) }),
]);

export type SheetAction = z.infer<typeof actionSchema>;
export type ParseResult = { ok: true; value: SheetAction } | { ok: false; error: string };

export function parseSheetAction(body: unknown): ParseResult {
  const r = actionSchema.safeParse(body);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.message };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/http/sheet-actions.test.ts`
Expected: PASS — 6 tests green.

- [ ] **Step 5: Commit**

```bash
git add src/lib/http/sheet-actions.ts src/lib/http/sheet-actions.test.ts
git commit -m "feat(http): валидация действий ревью листа (save/confirm/map/ignore)"
```

---

## Task 11: Apply movement edits + confirm (repo)

**Files:**
- Create: `src/lib/db/apply-edits.ts`
- Test: `src/lib/db/apply-edits.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/db/apply-edits.test.ts
import { describe, it, expect } from 'vitest';
import { computeEditedMovements } from './apply-edits';

describe('computeEditedMovements', () => {
  it('chains soldCalc within the batch and uses prevOstatok from DB for the earliest date', async () => {
    // DB says ostatok before 2026-06-05 for (point-1,p1) was 3.
    const getPrev = async () => 3;
    const out = await computeEditedMovements(
      'point-1',
      [
        { productId: 'p1', date: '2026-06-06', prihod: 8, ostatok: 2, spisanie: 0 },
        { productId: 'p1', date: '2026-06-05', prihod: 8, ostatok: 9, spisanie: 0 },
      ],
      getPrev,
    );
    // Sorted by date per product. 05: sold = 3 + 8 - 0 - 9 = 2. 06: sold = 9 + 8 - 0 - 2 = 15.
    const byDate = Object.fromEntries(out.map((m) => [m.date, m.soldCalc]));
    expect(byDate['2026-06-05']).toBe(2);
    expect(byDate['2026-06-06']).toBe(15);
    expect(out.every((m) => m.manuallyEdited)).toBe(true);
  });

  it('leaves soldCalc null when there is no prior ostatok base', async () => {
    const getPrev = async () => null;
    const out = await computeEditedMovements(
      'point-1',
      [{ productId: 'p1', date: '2026-06-05', prihod: 8, ostatok: 9, spisanie: 0 }],
      getPrev,
    );
    expect(out[0].soldCalc).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/db/apply-edits.test.ts`
Expected: FAIL — cannot find module `./apply-edits`.

- [ ] **Step 3: Write the implementation**

```ts
// src/lib/db/apply-edits.ts
import type { PrismaClient } from '@prisma/client';
import { computeSold } from '@/lib/domain/computeSold';
import { toDbDate } from './dates';
import { getPreviousOstatok } from './movements-repo';
import type { MovementEdit } from '@/lib/http/sheet-actions';

export type EditedMovement = MovementEdit & {
  pointId: string;
  soldCalc: number | null;
  manuallyEdited: true;
};

type GetPrev = (pointId: string, productId: string, beforeDate: string) => Promise<number | null>;

/**
 * Чистый расчёт: по правкам считает soldCalc, цепляя остаток внутри партии правок по дате,
 * а для самой ранней даты товара берёт предыдущий остаток из БД (getPrev).
 */
export async function computeEditedMovements(
  pointId: string,
  edits: MovementEdit[],
  getPrev: GetPrev,
): Promise<EditedMovement[]> {
  const byProduct = new Map<string, MovementEdit[]>();
  for (const e of edits) {
    const list = byProduct.get(e.productId) ?? [];
    list.push(e);
    byProduct.set(e.productId, list);
  }

  const out: EditedMovement[] = [];
  for (const [productId, list] of byProduct) {
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));
    let prevOstatok: number | null = await getPrev(pointId, productId, sorted[0].date);
    for (const e of sorted) {
      const { sold } = computeSold({
        prevOstatok,
        prihod: e.prihod,
        spisanie: e.spisanie,
        ostatok: e.ostatok,
      });
      out.push({ ...e, pointId, soldCalc: sold, manuallyEdited: true });
      prevOstatok = e.ostatok;
    }
  }
  return out;
}

/** Запись правок в БД (manuallyEdited=true) + пересчёт soldCalc. */
export async function applyMovementEdits(
  prisma: PrismaClient,
  pointId: string,
  sheetId: string,
  edits: MovementEdit[],
): Promise<void> {
  const computed = await computeEditedMovements(pointId, edits, (pid, prod, before) =>
    getPreviousOstatok(prisma, pid, prod, before),
  );
  await prisma.$transaction(
    computed.map((m) => {
      const date = toDbDate(m.date);
      return prisma.movement.upsert({
        where: { pointId_productId_date: { pointId: m.pointId, productId: m.productId, date } },
        create: {
          pointId: m.pointId,
          productId: m.productId,
          date,
          prihod: m.prihod,
          ostatok: m.ostatok,
          spisanie: m.spisanie,
          soldCalc: m.soldCalc,
          sheetId,
          manuallyEdited: true,
        },
        update: {
          prihod: m.prihod,
          ostatok: m.ostatok,
          spisanie: m.spisanie,
          soldCalc: m.soldCalc,
          manuallyEdited: true,
        },
      });
    }),
  );
}

/** Перевод листа в confirmed. */
export async function confirmSheet(prisma: PrismaClient, sheetId: string): Promise<void> {
  await prisma.sheet.update({
    where: { id: sheetId },
    data: { status: 'confirmed', confirmedAt: new Date() },
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/db/apply-edits.test.ts`
Expected: PASS — 2 tests green. (`computeSold` returns `{ sold: null }` when `prevOstatok` is null — verify against `src/lib/domain/computeSold.ts`; the second test asserts this.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/apply-edits.ts src/lib/db/apply-edits.test.ts
git commit -m "feat(db): применение ручных правок движений + пересчёт продано + confirm"
```

---

## Task 12: Sheet PATCH/confirm API route

**Files:**
- Create: `src/app/api/sheets/[id]/route.ts`

No new unit test (validation is Task 10; DB ops are Task 11; route is thin wiring verified in preview).

- [ ] **Step 1: Write the route**

```ts
// src/app/api/sheets/[id]/route.ts
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { parseSheetAction } from '@/lib/http/sheet-actions';
import { applyMovementEdits, confirmSheet } from '@/lib/db/apply-edits';

export const runtime = 'nodejs';

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id: sheetId } = await params;
  const parsed = parseSheetAction(await req.json().catch(() => null));
  if (!parsed.ok) return Response.json({ error: parsed.error }, { status: 400 });

  const prisma = getPrisma();
  const sheet = await prisma.sheet.findUnique({ where: { id: sheetId }, select: { pointId: true } });
  if (!sheet) return Response.json({ error: 'Лист не найден' }, { status: 404 });

  const action = parsed.value;
  switch (action.action) {
    case 'save':
      await applyMovementEdits(prisma, sheet.pointId, sheetId, action.edits);
      return Response.json({ ok: true });
    case 'confirm':
      await confirmSheet(prisma, sheetId);
      return Response.json({ ok: true });
    case 'mapUnknown':
      await prisma.unknownLine.update({
        where: { id: action.id },
        data: { status: 'mapped', mappedProductId: action.productId },
      });
      return Response.json({ ok: true });
    case 'ignoreUnknown':
      await prisma.unknownLine.update({
        where: { id: action.id },
        data: { status: 'ignored' },
      });
      return Response.json({ ok: true });
  }
}
```

- [ ] **Step 2: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: succeeds; `/api/sheets/[id]` Node route listed. (The `switch` is exhaustive over the discriminated union — no `default` needed.)

- [ ] **Step 3: Commit**

```bash
git add src/app/api/sheets
git commit -m "feat(api): PATCH листа — правки/подтверждение/маппинг unknown-строк"
```

---

## Task 13: Review table component + sheet page

**Files:**
- Create: `src/app/sheets/[id]/ReviewTable.tsx`
- Create: `src/app/sheets/[id]/page.tsx`

- [ ] **Step 1: Write the review table (client)**

```tsx
// src/app/sheets/[id]/ReviewTable.tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import styles from '../../ui.module.css';
import type { SheetView, ViewCell } from '@/lib/db/sheet-view';

type Field = 'prihod' | 'ostatok' | 'spisanie';
type CellKey = string; // `${productId}|${date}|${field}`

const key = (productId: string, date: string, field: Field): CellKey => `${productId}|${date}|${field}`;
const toNum = (s: string): number | null => {
  const t = s.trim();
  if (t === '') return null;
  const n = Number(t);
  return Number.isInteger(n) ? n : null;
};

export function ReviewTable({ view }: { view: SheetView }) {
  const router = useRouter();
  const [edits, setEdits] = useState<Record<CellKey, string>>({});
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState('');
  const confirmed = view.status === 'confirmed';

  const cellValue = (productId: string, date: string, field: Field, cell: ViewCell | undefined): string => {
    const k = key(productId, date, field);
    if (k in edits) return edits[k];
    const v = cell ? cell[field] : null;
    return v == null ? '' : String(v);
  };

  function setCell(productId: string, date: string, field: Field, raw: string) {
    setEdits((prev) => ({ ...prev, [key(productId, date, field)]: raw }));
  }

  async function patch(body: unknown, okMsg: string) {
    setBusy(true);
    setMsg('');
    const res = await fetch(`/api/sheets/${view.sheetId}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    });
    setBusy(false);
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setMsg(d.error ?? 'Ошибка');
      return;
    }
    setMsg(okMsg);
    setEdits({});
    router.refresh();
  }

  function save() {
    // Собираем правки по (товар,дата): берём текущее значение всех трёх полей.
    const touched = new Set(Object.keys(edits).map((k) => k.split('|').slice(0, 2).join('|')));
    const payload = [...touched].map((pd) => {
      const [productId, date] = pd.split('|');
      const cell = view.rows.find((r) => r.productId === productId)?.cells[date];
      return {
        productId,
        date,
        prihod: toNum(cellValue(productId, date, 'prihod', cell)),
        ostatok: toNum(cellValue(productId, date, 'ostatok', cell)),
        spisanie: toNum(cellValue(productId, date, 'spisanie', cell)),
      };
    });
    if (payload.length === 0) {
      setMsg('Нет изменений');
      return;
    }
    patch({ action: 'save', edits: payload }, 'Сохранено');
  }

  return (
    <>
      {msg && <p className={styles.error}>{msg}</p>}
      <div style={{ overflowX: 'auto' }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th rowSpan={2} className={styles.rowName}>
                Товар
              </th>
              {view.dates.map((d) => (
                <th key={d} colSpan={3}>
                  {d.slice(5)}
                </th>
              ))}
            </tr>
            <tr>
              {view.dates.map((d) => (
                <th key={d} colSpan={3} style={{ fontSize: 11 }}>
                  П / О / С
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {view.rows.map((row) => (
              <tr key={row.productId}>
                <td className={styles.rowName}>{row.productName}</td>
                {view.dates.flatMap((d) => {
                  const cell = row.cells[d];
                  const low = cell?.low ?? false;
                  return (['prihod', 'ostatok', 'spisanie'] as Field[]).map((field) => (
                    <td
                      key={`${d}|${field}`}
                      className={`${field === 'ostatok' ? styles.cellOstatok : ''} ${low ? styles.cellLow : ''}`}
                    >
                      <input
                        className={styles.cellInput}
                        inputMode="numeric"
                        disabled={confirmed || busy}
                        value={cellValue(row.productId, d, field, cell)}
                        onChange={(e) => setCell(row.productId, d, field, e.target.value)}
                      />
                      {cell?.raw && (
                        <span className={styles.raw}>{cell.raw[field] || '·'}</span>
                      )}
                    </td>
                  ));
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {view.unknownLines.length > 0 && (
        <section style={{ marginTop: 24 }}>
          <h3>Новые/нераспознанные строки</h3>
          {view.unknownLines.map((u) => (
            <div key={u.id} style={{ display: 'flex', gap: 8, alignItems: 'center', marginBottom: 6 }}>
              <span style={{ flex: 1 }}>
                {u.rawText} <em style={{ color: '#999' }}>({u.status})</em>
              </span>
              {u.status === 'pending' && (
                <>
                  <select
                    defaultValue=""
                    disabled={busy}
                    onChange={(e) =>
                      e.target.value &&
                      patch({ action: 'mapUnknown', id: u.id, productId: e.target.value }, 'Сопоставлено')
                    }
                  >
                    <option value="" disabled>
                      Сопоставить с…
                    </option>
                    {view.products.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                  <button
                    className={`${styles.btn} ${styles.btnGhost}`}
                    disabled={busy}
                    onClick={() => patch({ action: 'ignoreUnknown', id: u.id }, 'Игнорировано')}
                  >
                    Игнор
                  </button>
                </>
              )}
            </div>
          ))}
        </section>
      )}

      {!confirmed && (
        <div style={{ display: 'flex', gap: 12, marginTop: 24 }}>
          <button className={styles.btn} disabled={busy} onClick={save}>
            Сохранить правки
          </button>
          <button
            className={styles.btn}
            disabled={busy}
            onClick={() => patch({ action: 'confirm' }, 'Лист подтверждён')}
          >
            Подтвердить лист
          </button>
        </div>
      )}
    </>
  );
}
```

- [ ] **Step 2: Write the sheet page (server)**

```tsx
// src/app/sheets/[id]/page.tsx
import { notFound } from 'next/navigation';
// eslint-disable-next-line @next/next/no-img-element
import { getPrisma } from '@/lib/db/client';
import { loadSheetView } from '@/lib/db/sheet-view';
import { ReviewTable } from './ReviewTable';
import styles from '../../ui.module.css';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const STATUS: Record<string, { label: string; cls: string }> = {
  recognized: { label: 'Распознан', cls: styles.badgeRecognized },
  needs_review: { label: 'На проверке', cls: styles.badgeReview },
  confirmed: { label: 'Подтверждён', cls: styles.badgeConfirmed },
  uploaded: { label: 'Загружен', cls: styles.badgeRecognized },
};

export default async function SheetPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadSheetView(getPrisma(), id);
  if (!view) notFound();

  const st = STATUS[view.status] ?? { label: view.status, cls: styles.badgeRecognized };

  return (
    <main className={styles.shell}>
      <h1>
        {view.pointName} · {view.sheetType}{' '}
        <span className={`${styles.badge} ${st.cls}`}>{st.label}</span>
      </h1>
      <p>
        Колонка «Остаток» (О) выделена жёлтым; ячейки с низкой уверенностью — оранжевой рамкой. Под каждым
        полем — исходный текст с листа.
      </p>
      <details style={{ margin: '12px 0' }}>
        <summary>Фото листа</summary>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={view.imageUrl} alt="Лист" style={{ maxWidth: '100%', marginTop: 8 }} />
      </details>
      <ReviewTable view={view} />
    </main>
  );
}
```

- [ ] **Step 3: Verify build**

Run: `npx tsc --noEmit && npm run build`
Expected: succeeds. If ESLint flags the `<img>`, the inline disable comment covers it; if `next/image` is preferred by config, the build still passes with the disable.

- [ ] **Step 4: Preview verification (full e2e)**

With the dev server running and `.env` loaded:
1. Log in (`bakery-2026`).
2. If a real sheet was ingested in Task 8's e2e, open `/sheets/<id>`. Otherwise ingest one now via `preview_eval` POST to `/api/upload` (fetch a fixture/base64 image → FormData), capture the returned `sheetId`, then navigate to `/sheets/<sheetId>`.
3. `preview_snapshot` → expect the pivot grid (products × dates × П/О/С), yellow «Остаток» column, raw text under cells, unknown-lines block if any.
4. `preview_fill` an «Остаток» input with a new number, `preview_click` "Сохранить правки" → expect "Сохранено"; `preview_eval` query (or reload) to confirm the value persisted and `soldCalc` recomputed (check via a `fetch('/api/...')` is not available — instead reload and read the input value).
5. `preview_click` "Подтвердить лист" → expect badge → "Подтверждён" and inputs disabled.
6. `preview_screenshot` the confirmed review grid (proof).

Fix any issues (read `preview_console_logs` / `preview_logs`, edit source, re-verify).

- [ ] **Step 5: Commit**

```bash
git add src/app/sheets
git commit -m "feat(ui): ревью-страница листа — редактируемая сетка + подтверждение"
```

---

## Task 14: Full verification, env, deploy

**Files:** none (verification + ops)

- [ ] **Step 1: Full test + type + lint**

Run: `npx tsc --noEmit && npx eslint src && npm test`
Expected: tsc clean; eslint clean; all unit tests pass (prior 63 + new: catalog-repo, upload-input, sheet-view, sheet-actions, apply-edits); integration tests skip without keys.

- [ ] **Step 2: Integration smoke (optional, live Neon)**

Run:
```bash
set -a; . ./.env; set +a
npx vitest run src/lib/db/persist-recognition.integration.test.ts
```
Expected: PASS (confirms the engine still talks to live Neon).

- [ ] **Step 3: Choose the real shared password with the user**

Ask the user for the production `APP_PASSWORD` (or confirm a generated one). Do NOT reuse the local placeholder.

- [ ] **Step 4: Set Vercel env vars**

For `AUTH_SECRET` and `APP_PASSWORD`, set Production + Development (Preview needs a branch arg — skip, consistent with existing vars):
```bash
# AUTH_SECRET — reuse a strong random value (can be the local one or a fresh openssl rand -base64 32)
printf '%s' "<AUTH_SECRET>" | npx vercel env add AUTH_SECRET production
printf '%s' "<AUTH_SECRET>" | npx vercel env add AUTH_SECRET development
printf '%s' "<APP_PASSWORD>" | npx vercel env add APP_PASSWORD production
printf '%s' "<APP_PASSWORD>" | npx vercel env add APP_PASSWORD development
```
Note: Auth.js v5 also accepts `NEXTAUTH_URL`/`AUTH_URL`; with `trustHost: true` it is not required on Vercel. If sign-in redirects misbehave in prod, set `AUTH_URL=https://bakery-ops-two.vercel.app` (per [[feedback_nextauth_url_vercel]] — the generic alias is taken).

- [ ] **Step 5: Deploy to production**

Run: `npx vercel deploy --prod --yes`
Expected: READY; aliased to https://bakery-ops-two.vercel.app.

- [ ] **Step 6: Production smoke**

Run: `curl -sI https://bakery-ops-two.vercel.app/ | head -1`
Expected: `HTTP/2 307` (redirect to /login) — confirms auth gate is live. Then manually (or via chrome MCP) log in and load `/upload`.

- [ ] **Step 7: Update project memory**

Edit `/Users/nkola/.claude/projects/-Users-nkola/memory/project_bakery_ops.md`: record Plan 3c done (web loop: Auth.js shared-password gate, web upload route+page, review/confirm UI, catalog loader, edit/recompute), new unit test count, prod URL behind login, and that Plan 3d (Telegram) is next. Keep the rotate-secrets reminder.

- [ ] **Step 8: Final commit (if any uncommitted) + push**

```bash
git add -A && git commit -m "chore(3c): финальная проверка веб-цикла" || true
git push
```

---

## Self-Review (completed during planning)

**Spec coverage (§7 capture→recognize→confirm, §11 auth):**
- §7.1 web capture → Tasks 7–8 (upload route + page). §7.2 recognition → reuses tested `ingestSheetPhoto` (Task 3 deps). §7.3 confirmation with edits + highlight «Остаток»/low-confidence → Tasks 9, 13. `unknown_lines` block → Tasks 12, 13 (map/ignore; auto-movement deferred, noted). §7.4 fixation (status=confirmed, recompute sold) → Tasks 11–13.
- §11 auth (NextAuth, owner access) → Tasks 4–5; secrets in Vercel env → Task 14. Telegram allowlist → **deferred to Plan 3d** (explicitly out of scope here).
- Catalog *read* from DB (§6 input) → Task 1. Catalog admin CRUD → Plan 4 (out of scope).
- Dashboard/aging (§9–§10) → Plan 4 (out of scope).

**Placeholder scan:** No TBD/"handle errors"/"similar to". `APP_PASSWORD` local value is an explicit placeholder replaced with the user in Task 14 — called out, not silent.

**Type consistency:** `CatalogEntry` (id/name/aliases) matches `match-product.ts`. `IngestDeps`/`IngestInput` shapes match `ingest-sheet.ts`. `MovementEdit` defined in Task 10 is consumed by Task 11 (`computeEditedMovements`, `applyMovementEdits`) and Task 13 payload. `SheetView`/`ViewCell` defined in Task 9, consumed in Task 13. `parseSheetAction` discriminated union (`save`/`confirm`/`mapUnknown`/`ignoreUnknown`) matches the Task 12 `switch`. `scopeForPoint` (Task 1) reused in Task 9. `getPreviousOstatok`/`toDbDate`/`computeSold`/`findSheetByImageHash` referenced with their real signatures from the existing code.

**Known limitation (logged):** freeform `unknown_lines` map sets `mappedProductId` only — it does not synthesize movements from handwritten numbers. Acceptable for Phase 1; revisit if confectionery freeform volume warrants it.

# Вкладки для сотрудников пекарни — план реализации

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Две вкладки только для чтения под телефон — «Выручка» (`/staff`) и «Смены и ЗП» (`/staff/shifts`) — за отдельным общим паролем сотрудников, без доступа к чему-либо ещё.

**Architecture:** Роль (`owner` | `staff`) определяется паролем при входе и живёт в JWT Auth.js; вся логика доступа — чистые функции в `src/lib/auth/roles.ts`, middleware и API-роуты только применяют их. Страницы сотрудника — серверные компоненты: тонкая страница грузит данные существующими `loadBreakdown`/`loadFot`, чистая модель вида (`src/lib/staff/`) превращает их в то, что рисуется, и только это уходит в HTML.

**Tech Stack:** Next.js 16.2.7 (App Router), next-auth 5.0.0-beta.31 (Credentials, JWT), React 19, Prisma 7, Vitest 4, tsx.

**Spec:** `docs/superpowers/specs/2026-09-23-bakery-ops-staff-view-design.md`

## Global Constraints

- Зависимости не обновлять и не добавлять.
- Роли: `owner` | `staff`. `APP_PASSWORD` → `owner` (проверяется первым); непустой `STAFF_PASSWORD` → `staff`; пустой или не заданный `STAFF_PASSWORD` отключает вход сотрудников.
- Сессии, выданные до выкладки (без роли), считаются `owner`.
- Отпечаток в JWT сотрудника — короткий HMAC `STAFF_PASSWORD` на `AUTH_SECRET`, не сам пароль; не совпал с текущим — сессия недействительна, редирект на `/login`.
- `staff`: разрешены только `/staff` и `/staff/**`; прочие страницы → редирект на `/staff`; любой `/api/**`, кроме `/api/auth/**`, → 403. Без сессии: страницы → `/login`, API → 401.
- `/api/telegram` остаётся вне middleware — не трогать.
- Страницы `/staff/**` — серверные компоненты; клиентских компонентов с данными нет; итоги месяца (`totals`, `dailyTotal`), кондитерка и фикс-выплаты не попадают в HTML/RSC.
- «Сегодня» на страницах сотрудника — дата по Europe/Moscow.
- Цвета: пироги `#1a4633`, кондитерка `#4c805a`; цвета премий — `BONUS_LEVELS` из `src/lib/fot/bonus-colors.ts`.
- Зоны нажатия не меньше 44 px; на ширине 360 px нет горизонтальной прокрутки страницы; на компьютере колонка по центру, `maxWidth: 480`.
- Тексты интерфейса и комментарии — по-русски. Тесты — рядом с кодом, `*.test.ts` (так их находит `vitest.config.ts`).
- Коммиты: сообщение на русском в стиле `git log` проекта, последняя строка ровно `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Не пушить, не деплоить.
- Пароли в формы не вводить; визуальная проверка — только через рендер на фикстурах (Task 5–6).

## Review Focus

1. Сотрудник без единой смены в месяце (новенький или весь месяц снят вручную) — карточка без строк выплат, с текстом «Смен в этом месяце нет.», без «0 ₽» и без падения. Тест — Task 4.
2. Людмила (кухня, премии нет) — отработанные дни без суммы, выплата «база …» без премий, и выплата не помечается «предварительно» из-за отсутствующей выручки. Тест — Task 4.
3. Переключение на будущий месяц — все смены «план», выплаты «предварительно»; на прошедший полностью внесённый месяц — ни «…», ни «предварительно». Тесты — Task 4.
4. Просмотр ночью (00:00–03:00 МСК, в UTC ещё вчера) — сегодняшняя смена показывается «…», а не «план», месяц по умолчанию московский (в ночь на 1-е — уже новый). Тесты — Task 4.
5. Сотрудник со старой закладкой на страницу владельца (`/fot`, `/sheets/abc`) или с похожим путём `/staffx` — уводит на `/staff`, а не показывает страницу. Тест — Task 1.

---

### Task 1: Роли и правило доступа (чистые функции)

**Files:**
- Create: `src/lib/auth/roles.ts`
- Test: `src/lib/auth/roles.test.ts`

**Interfaces:**
- Consumes: ничего.
- Produces:
  - `type Role = 'owner' | 'staff'`
  - `type RoleEnv = { APP_PASSWORD?: string; STAFF_PASSWORD?: string; AUTH_SECRET?: string }`
  - `resolveRole(password: string, env: RoleEnv): Role | null`
  - `staffFingerprint(staffPassword: string, secret: string): Promise<string>` — 16 hex-символов
  - `effectiveRole(claims: { role?: unknown; fp?: unknown }, env: RoleEnv): Promise<Role | null>`
  - `roleOf(session: unknown): Role | null`
  - `type AccessDecision = { kind: 'allow' } | { kind: 'redirect'; to: string } | { kind: 'deny'; status: 401 | 403 }`
  - `accessDecision(role: Role | null, pathname: string): AccessDecision`

- [ ] **Step 1: Написать падающие тесты**

`src/lib/auth/roles.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { resolveRole, staffFingerprint, effectiveRole, roleOf, accessDecision } from './roles';

const env = { APP_PASSWORD: 'owner-pass', STAFF_PASSWORD: 'staff-pass', AUTH_SECRET: 'secret-1' };

describe('resolveRole', () => {
  it('пароль владельца → owner', () => expect(resolveRole('owner-pass', env)).toBe('owner'));
  it('пароль сотрудников → staff', () => expect(resolveRole('staff-pass', env)).toBe('staff'));
  it('неверный пароль → null', () => expect(resolveRole('nope', env)).toBeNull());
  it('пустой ввод при пустом STAFF_PASSWORD → null', () => expect(resolveRole('', { ...env, STAFF_PASSWORD: '' })).toBeNull());
  it('STAFF_PASSWORD не задан → вход сотрудников отключён', () =>
    expect(resolveRole('staff-pass', { APP_PASSWORD: 'owner-pass' })).toBeNull());
  it('пароли совпали по ошибке настройки → владелец побеждает', () =>
    expect(resolveRole('same', { APP_PASSWORD: 'same', STAFF_PASSWORD: 'same' })).toBe('owner'));
});

describe('staffFingerprint', () => {
  it('детерминирован, 16 hex-символов, пароля в нём нет', async () => {
    const a = await staffFingerprint('staff-pass', 'secret-1');
    expect(a).toMatch(/^[0-9a-f]{16}$/);
    expect(await staffFingerprint('staff-pass', 'secret-1')).toBe(a);
    expect(a).not.toContain('staff');
  });
  it('меняется и при смене пароля, и при смене секрета', async () => {
    const a = await staffFingerprint('staff-pass', 'secret-1');
    expect(await staffFingerprint('staff-pass-2', 'secret-1')).not.toBe(a);
    expect(await staffFingerprint('staff-pass', 'secret-2')).not.toBe(a);
  });
  it('пустой секрет не роняет расчёт', async () => {
    expect(await staffFingerprint('staff-pass', '')).toMatch(/^[0-9a-f]{16}$/);
  });
});

describe('effectiveRole', () => {
  it('сессия до выкладки (без роли) → owner', async () => expect(await effectiveRole({}, env)).toBe('owner'));
  it('owner → owner', async () => expect(await effectiveRole({ role: 'owner' }, env)).toBe('owner'));
  it('staff с актуальным отпечатком → staff', async () => {
    const fp = await staffFingerprint('staff-pass', 'secret-1');
    expect(await effectiveRole({ role: 'staff', fp }, env)).toBe('staff');
  });
  it('staff после смены пароля → null', async () => {
    const fp = await staffFingerprint('old-pass', 'secret-1');
    expect(await effectiveRole({ role: 'staff', fp }, env)).toBeNull();
  });
  it('staff без отпечатка → null', async () => expect(await effectiveRole({ role: 'staff' }, env)).toBeNull());
  it('staff, когда STAFF_PASSWORD убрали → null', async () => {
    const fp = await staffFingerprint('staff-pass', 'secret-1');
    expect(await effectiveRole({ role: 'staff', fp }, { ...env, STAFF_PASSWORD: '' })).toBeNull();
  });
  it('неизвестная роль → null', async () => expect(await effectiveRole({ role: 'admin' }, env)).toBeNull());
});

describe('roleOf', () => {
  it('читает роль из сессии', () => {
    expect(roleOf({ role: 'owner' })).toBe('owner');
    expect(roleOf({ role: 'staff' })).toBe('staff');
  });
  it('нет сессии, нет роли или мусор → null', () => {
    expect(roleOf(null)).toBeNull();
    expect(roleOf(undefined)).toBeNull();
    expect(roleOf({})).toBeNull();
    expect(roleOf({ role: null })).toBeNull();
    expect(roleOf({ role: 'admin' })).toBeNull();
  });
});

describe('accessDecision', () => {
  const allow = { kind: 'allow' };
  it('без сессии: страницы → /login, API → 401', () => {
    expect(accessDecision(null, '/')).toEqual({ kind: 'redirect', to: '/login' });
    expect(accessDecision(null, '/staff')).toEqual({ kind: 'redirect', to: '/login' });
    expect(accessDecision(null, '/api/finance')).toEqual({ kind: 'deny', status: 401 });
  });
  it('/api/auth пропускается при любой роли', () => {
    expect(accessDecision(null, '/api/auth/session')).toEqual(allow);
    expect(accessDecision('staff', '/api/auth/session')).toEqual(allow);
  });
  it('владельцу можно всё, включая вкладки сотрудников', () => {
    for (const p of ['/', '/fot', '/staff', '/staff/shifts', '/api/fot/attendance']) expect(accessDecision('owner', p)).toEqual(allow);
  });
  it('сотруднику — /staff и всё под ним', () => {
    expect(accessDecision('staff', '/staff')).toEqual(allow);
    expect(accessDecision('staff', '/staff/shifts')).toEqual(allow);
  });
  it('сотрудника с любой другой страницы, включая похожую /staffx, уводит на /staff', () => {
    for (const p of ['/', '/fot', '/revenue', '/breakdown', '/expenses', '/upload', '/sheets/abc', '/staffx']) {
      expect(accessDecision('staff', p)).toEqual({ kind: 'redirect', to: '/staff' });
    }
  });
  it('сотруднику любой API, кроме auth, — 403', () => {
    for (const p of ['/api/fot/attendance', '/api/finance', '/api/revenue/manual', '/api/upload']) {
      expect(accessDecision('staff', p)).toEqual({ kind: 'deny', status: 403 });
    }
  });
});
```

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run src/lib/auth/roles.test.ts`
Expected: FAIL — `Failed to resolve import "./roles"`.

- [ ] **Step 3: Реализация**

`src/lib/auth/roles.ts`:

```ts
export type Role = 'owner' | 'staff';
export type RoleEnv = { APP_PASSWORD?: string; STAFF_PASSWORD?: string; AUTH_SECRET?: string };

/** Роль по введённому паролю. Владелец проверяется первым: при совпадении паролей побеждает он. */
export function resolveRole(password: string, env: RoleEnv): Role | null {
  const owner = env.APP_PASSWORD ?? '';
  if (owner.length > 0 && password === owner) return 'owner';
  const staff = env.STAFF_PASSWORD ?? '';
  if (staff.length > 0 && password === staff) return 'staff';
  return null;
}

/**
 * Отпечаток пароля сотрудников для JWT: HMAC-SHA256 на AUTH_SECRET, первые 8 байт в hex.
 * Web Crypto — работает и в middleware, и в Node.
 */
export async function staffFingerprint(staffPassword: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  // Web Crypto не принимает HMAC-ключ нулевой длины.
  const key = await crypto.subtle.importKey('raw', enc.encode(secret || 'bakery-ops'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(staffPassword)));
  return Array.from(sig.slice(0, 8), (b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Действующая роль по данным из JWT. Токены без роли выданы до появления ролей — это владелец.
 * Сотрудник действителен, только пока отпечаток совпадает с текущим STAFF_PASSWORD.
 */
export async function effectiveRole(claims: { role?: unknown; fp?: unknown }, env: RoleEnv): Promise<Role | null> {
  if (claims.role === undefined || claims.role === 'owner') return 'owner';
  if (claims.role !== 'staff') return null;
  const staff = env.STAFF_PASSWORD ?? '';
  if (staff.length === 0) return null;
  return claims.fp === (await staffFingerprint(staff, env.AUTH_SECRET ?? '')) ? 'staff' : null;
}

/** Роль из сессии Auth.js (её кладёт session-колбэк); всё остальное — null. */
export function roleOf(session: unknown): Role | null {
  const role = (session as { role?: unknown } | null | undefined)?.role;
  return role === 'owner' || role === 'staff' ? role : null;
}

export type AccessDecision = { kind: 'allow' } | { kind: 'redirect'; to: string } | { kind: 'deny'; status: 401 | 403 };

/** Кто куда ходит: таблица из раздела 1 спеки. */
export function accessDecision(role: Role | null, pathname: string): AccessDecision {
  if (pathname === '/api/auth' || pathname.startsWith('/api/auth/')) return { kind: 'allow' };
  const isApi = pathname.startsWith('/api/');
  if (role === null) return isApi ? { kind: 'deny', status: 401 } : { kind: 'redirect', to: '/login' };
  if (role === 'owner') return { kind: 'allow' };
  if (isApi) return { kind: 'deny', status: 403 };
  if (pathname === '/staff' || pathname.startsWith('/staff/')) return { kind: 'allow' };
  return { kind: 'redirect', to: '/staff' };
}
```

- [ ] **Step 4: Тесты зелёные**

Run: `npx vitest run src/lib/auth/roles.test.ts`
Expected: PASS, все тесты файла.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/auth/roles.ts src/lib/auth/roles.test.ts
git commit -m "feat(auth): роли владелец/сотрудник и правило доступа — чистые функции

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Вход с ролями, middleware и охрана API

**Files:**
- Modify: `src/auth.ts` (весь файл)
- Modify: `src/middleware.ts` (весь файл)
- Create: `src/lib/auth/require-owner.ts`
- Test: `src/lib/auth/require-owner.test.ts`
- Modify (по два места в каждом — импорт и проверка в каждом обработчике): `src/app/api/expenses/import-statement/route.ts`, `src/app/api/finance/[id]/route.ts` (DELETE и PATCH), `src/app/api/finance/import/route.ts`, `src/app/api/finance/route.ts` (GET и POST), `src/app/api/fot/attendance/route.ts`, `src/app/api/revenue/iiko-upload/route.ts`, `src/app/api/revenue/manual/route.ts`, `src/app/api/sheets/[id]/route.ts`, `src/app/api/upload/route.ts`
- Test: `src/app/api/api-guard.test.ts`

**Interfaces:**
- Consumes (Task 1): `resolveRole`, `staffFingerprint`, `effectiveRole`, `roleOf`, `accessDecision` из `@/lib/auth/roles`.
- Produces: `requireOwner(): Promise<Session | Response>` из `@/lib/auth/require-owner` — сессия владельца либо готовый ответ 401/403. Сессия после этого таска всегда несёт `role: 'owner' | 'staff' | null` (кладёт session-колбэк); читать её — только через `roleOf(session)`.

- [ ] **Step 1: Падающие тесты охраны**

`src/lib/auth/require-owner.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import { auth } from '@/auth';
import { requireOwner } from './require-owner';

vi.mock('@/auth', () => ({ auth: vi.fn() }));
const mockAuth = vi.mocked(auth as unknown as () => Promise<unknown>);

describe('requireOwner', () => {
  it('нет сессии → 401', async () => {
    mockAuth.mockResolvedValue(null);
    const r = await requireOwner();
    expect(r).toBeInstanceOf(Response);
    expect((r as Response).status).toBe(401);
  });
  it('сотрудник → 403 с кодом FORBIDDEN', async () => {
    mockAuth.mockResolvedValue({ role: 'staff', user: { name: 'Сотрудник' } });
    const r = (await requireOwner()) as Response;
    expect(r.status).toBe(403);
    expect(await r.json()).toEqual({ error: 'Forbidden', code: 'FORBIDDEN' });
  });
  it('сессия с отозванной ролью (сменили пароль сотрудников) → 401', async () => {
    mockAuth.mockResolvedValue({ role: null, user: { name: 'Сотрудник' } });
    expect(((await requireOwner()) as Response).status).toBe(401);
  });
  it('владелец → сама сессия, роут берёт из неё имя', async () => {
    const s = { role: 'owner', user: { name: 'Пекарня' } };
    mockAuth.mockResolvedValue(s);
    expect(await requireOwner()).toBe(s);
  });
});
```

`src/app/api/api-guard.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest';
import * as importStatement from '@/app/api/expenses/import-statement/route';
import * as financeId from '@/app/api/finance/[id]/route';
import * as financeImport from '@/app/api/finance/import/route';
import * as finance from '@/app/api/finance/route';
import * as attendance from '@/app/api/fot/attendance/route';
import * as iikoUpload from '@/app/api/revenue/iiko-upload/route';
import * as revenueManual from '@/app/api/revenue/manual/route';
import * as sheet from '@/app/api/sheets/[id]/route';
import * as upload from '@/app/api/upload/route';

vi.mock('@/auth', () => ({ auth: vi.fn(async () => ({ role: 'staff', user: { name: 'Сотрудник' } })) }));

const req = () => new Request('http://localhost/api/x', { method: 'POST', body: '{}' });
const params = { params: Promise.resolve({ id: 'x' }) };

const cases: [string, () => Promise<Response>][] = [
  ['POST /api/expenses/import-statement', () => importStatement.POST(req())],
  ['DELETE /api/finance/[id]', () => financeId.DELETE(req(), params)],
  ['PATCH /api/finance/[id]', () => financeId.PATCH(req(), params)],
  ['POST /api/finance/import', () => financeImport.POST(req())],
  ['GET /api/finance', () => finance.GET()],
  ['POST /api/finance', () => finance.POST(req())],
  ['POST /api/fot/attendance', () => attendance.POST(req())],
  ['POST /api/revenue/iiko-upload', () => iikoUpload.POST(req())],
  ['POST /api/revenue/manual', () => revenueManual.POST(req())],
  ['PATCH /api/sheets/[id]', () => sheet.PATCH(req(), params)],
  ['POST /api/upload', () => upload.POST(req())],
];

describe('API владельца: сессия сотрудника получает 403 до любых обращений к данным', () => {
  it.each(cases)('%s', async (_name, call) => {
    expect((await call()).status).toBe(403);
  });
});
```

Если какой-то роут не импортируется в тестах из-за побочного эффекта на верхнем уровне его зависимости (например, клиент внешнего API без ключа), замокай именно эту зависимость через `vi.mock('<путь>', () => ({ <экспорт>: vi.fn() }))` в `api-guard.test.ts`: охрана срабатывает раньше любого обращения к зависимостям, так что содержимое мока неважно.

- [ ] **Step 2: Убедиться, что тесты падают**

Run: `npx vitest run src/lib/auth/require-owner.test.ts src/app/api/api-guard.test.ts`
Expected: FAIL — `require-owner.test.ts` не находит `./require-owner`; в `api-guard.test.ts` роуты отвечают 200/400/500 вместо 403 (сейчас любая сессия проходит).

- [ ] **Step 3: Охрана API**

`src/lib/auth/require-owner.ts`:

```ts
import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { roleOf } from './roles';

/**
 * Охрана API-роутов владельца. Владелец — возвращаем его сессию (роутам нужно имя),
 * иначе готовый ответ: 401 — сессии нет или она отозвана, 403 — сотрудник.
 */
export async function requireOwner(): Promise<Session | Response> {
  const session = await auth();
  const role = roleOf(session);
  if (!session || role === null) return Response.json({ error: 'Unauthorized', code: 'AUTH' }, { status: 401 });
  if (role !== 'owner') return Response.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  return session;
}
```

В каждом из девяти файлов роутов:

1. Заменить импорт `import { auth } from '@/auth';` на `import { requireOwner } from '@/lib/auth/require-owner';`
2. В каждом обработчике (их 11) заменить две строки

```ts
  const session = await auth();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });
```

на

```ts
  const session = await requireOwner();
  if (session instanceof Response) return session;
```

Имя переменной `session` сохраняется намеренно: `finance/route.ts`, `finance/import/route.ts` и `upload/route.ts` дальше читают `session.user?.name` — после проверки `instanceof` тип сужен до `Session`, остальной код не меняется.

Проверка, что ничего не пропущено:

Run: `grep -rn "await auth()" src/app/api; grep -rc "await requireOwner()" src/app/api --include=route.ts | grep -v ":0"`
Expected: первая команда ничего не выводит; вторая — 9 файлов, в сумме 11 вхождений (`finance/route.ts:2`, `finance/[id]/route.ts:2`, остальные по 1).

- [ ] **Step 4: Роли во входе и в middleware**

`src/auth.ts` целиком:

```ts
import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { effectiveRole, resolveRole, staffFingerprint } from '@/lib/auth/roles';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { password: { label: 'Пароль', type: 'password' } },
      authorize: async (creds) => {
        const password = typeof creds?.password === 'string' ? creds.password : '';
        const role = resolveRole(password, process.env);
        if (role === null) return null;
        const fp = role === 'staff' ? await staffFingerprint(process.env.STAFF_PASSWORD ?? '', process.env.AUTH_SECRET ?? '') : undefined;
        const user = { id: role, name: role === 'owner' ? 'Пекарня' : 'Сотрудник', role, fp };
        return user;
      },
    }),
  ],
  callbacks: {
    authorized: ({ auth }) => !!auth,
    jwt: ({ token, user }) => {
      if (user) {
        const u = user as { role?: string; fp?: string };
        token.role = u.role;
        token.fp = u.fp;
      }
      return token;
    },
    // Роль пересчитывается на каждом запросе: так смена STAFF_PASSWORD сразу отзывает сессии сотрудников.
    session: async ({ session, token }) =>
      Object.assign(session, { role: await effectiveRole({ role: token.role, fp: token.fp }, process.env) }),
  },
});
```

`src/middleware.ts` целиком:

```ts
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { accessDecision, roleOf } from '@/lib/auth/roles';

// Правило «кто куда» — accessDecision (src/lib/auth/roles.ts). Для API — JSON с кодом,
// чтобы fetch на клиенте получил понятный статус, а не HTML-страницу логина.
export default auth((req) => {
  const decision = accessDecision(roleOf(req.auth), req.nextUrl.pathname);
  if (decision.kind === 'allow') return;
  if (decision.kind === 'deny') {
    const body = decision.status === 401 ? { error: 'Unauthorized', code: 'AUTH' } : { error: 'Forbidden', code: 'FORBIDDEN' };
    return NextResponse.json(body, { status: decision.status });
  }
  return NextResponse.redirect(new URL(decision.to, req.nextUrl.origin));
});

export const config = {
  matcher: ['/((?!api/auth|api/telegram|login|_next/static|_next/image|favicon.ico).*)'],
};
```

- [ ] **Step 5: Тесты и типы зелёные**

Run: `npx vitest run src/lib/auth src/app/api && npx tsc --noEmit`
Expected: PASS все тесты; `tsc` без ошибок. Если `tsc` ругается на типы колбэков Auth.js (`token.role`/`token.fp`), приведи через `as` в месте присваивания — поведение не менять.

- [ ] **Step 6: Полный прогон**

Run: `npm test && npx eslint src/lib src/app`
Expected: всё зелёное — существующие тесты не задеты.

- [ ] **Step 7: Коммит**

```bash
git add src/auth.ts src/middleware.ts src/lib/auth/require-owner.ts src/lib/auth/require-owner.test.ts src/app/api
git commit -m "feat(auth): вход сотрудников по отдельному паролю, middleware по ролям, API только владельцу

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: ФОТ — даты премий у выплаты и даты с внесённой выручкой

**Files:**
- Modify: `src/lib/db/fot-repo.ts` — типы `FotPayment` и `FotView`, сборка в `buildFot`
- Test: `src/lib/db/fot-repo.test.ts`

**Interfaces:**
- Consumes: существующие `buildFot`, `payPeriodAmounts` (у его результата уже есть `bonusDates: string[]`).
- Produces:
  - `FotPayment` += `bonusDates: string[]` — даты смен, чьи премии входят в эту выплату (могут быть в прошлом месяце).
  - `FotView` += `revenueDates: string[]` — отсортированные даты, за которые есть выручка Плюшкино во входных данных (у `loadFot` — прошлый и текущий месяц).

- [ ] **Step 1: Падающий тест**

В `src/lib/db/fot-repo.test.ts` внутрь `describe('buildFot — выплаты дважды в месяц', …)` добавить:

```ts
  it('выплата несёт даты своих премий, вид — даты с внесённой выручкой', () => {
    const v = buildSept();
    const evg = v.bakery.find((r) => r.employee.id === 'e')!.payments[0];
    expect(evg.bonusDates).toEqual(['2026-08-31', '2026-09-03', '2026-09-04', '2026-09-07', '2026-09-08', '2026-09-11', '2026-09-12']);
    expect(v.revenueDates[0]).toBe('2026-08-29');
    expect(v.revenueDates).toContain('2026-09-15');
    expect(v.revenueDates).toEqual([...v.revenueDates].sort());
  });
```

- [ ] **Step 2: Убедиться, что падает**

Run: `npx vitest run src/lib/db/fot-repo.test.ts`
Expected: FAIL — `evg.bonusDates` и `v.revenueDates` равны `undefined`.

- [ ] **Step 3: Реализация**

В `src/lib/db/fot-repo.ts`:

1. Тип выплаты:

```ts
/** Одна из двух выплат месяца: сколько, когда и из чего. `bonusDates` — чьи премии в неё вошли. */
export type FotPayment = { half: 1 | 2; payDate: string; shifts: number; base: number; bonus: number; amount: number; bonusDates: string[] };
```

2. В `FotView` после `dailyTotal` добавить поле:

```ts
  /** Даты с внесённой выручкой Плюшкино (прошлый и текущий месяц) — для «ждёт выручку» и «предварительно». */
  revenueDates: string[];
```

3. В `buildFot`, в `.map((p) => ({ … }))` сборки `payments` добавить последним полем `bonusDates: p.bonusDates,`.

4. В `return` функции `buildFot` добавить поле:

```ts
  return { month, monthDays, bakery, confectionery, fixed, dailyTotal, revenueDates: [...revenueByDate.keys()].sort(), totals };
```

- [ ] **Step 4: Тесты зелёные**

Run: `npm test && npx tsc --noEmit`
Expected: PASS. Если какой-то существующий тест сравнивает объект выплаты целиком через `toEqual`, дополни ожидаемое значение полем `bonusDates` с фактическими датами — логику расчёта не трогать.

- [ ] **Step 5: Коммит**

```bash
git add src/lib/db/fot-repo.ts src/lib/db/fot-repo.test.ts
git commit -m "feat(fot): у выплаты — даты её премий, у табеля — даты с внесённой выручкой

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Даты и модель вида для сотрудников (чистые функции)

**Files:**
- Create: `src/lib/staff/dates.ts`
- Test: `src/lib/staff/dates.test.ts`
- Create: `src/lib/staff/view-model.ts`
- Test: `src/lib/staff/view-model.test.ts`

**Interfaces:**
- Consumes: `monthDays(month)` из `@/lib/finance/month`; типы `FotRow`, `FotEmployee`, `FotPayment` (с `bonusDates` из Task 3) из `@/lib/db/fot-repo`; тип `BreakdownDay` из `@/lib/db/breakdown-repo`.
- Produces (`dates.ts`):
  - `todayMoscow(now: Date): string` — `'YYYY-MM-DD'`
  - `staffMonth(raw: string | undefined, now: Date): string` — `'YYYY-MM'`
  - `weekdayShort(iso: string): string` — `'пн'…'вс'`
  - `dayMonth(iso: string): string` — `'01.09'`
  - `dayMonthWord(iso: string): string` — `'15 сен'`
  - `calendarCells(month: string): (string | null)[]` — ведущие `null` до понедельника, затем все даты месяца
- Produces (`view-model.ts`):
  - `type DayState = { kind: 'off' } | { kind: 'planned' } | { kind: 'worked' } | { kind: 'bonus'; amount: number } | { kind: 'pending' }`
  - `hasBonusScheme(role: FotEmployee['role']): boolean`
  - `dayState(a: { date: string; present: boolean; pay: number; basePay: number; bonusScheme: boolean; revenueEntered: boolean; today: string }): DayState`
  - `isPreliminary(p: { payDate: string; bonusDates: string[] }, a: { today: string; bonusScheme: boolean; revenueDates: ReadonlySet<string> }): boolean`
  - `type CalendarCell = { date: string; day: number; state: DayState } | null`
  - `type PayoutLine = { half: 1 | 2; title: string; amount: number; base: number; bonus: number; showBonus: boolean; preliminary: boolean }`
  - `type EmployeeCardModel = { id: string; name: string; subtitle: string; cells: CalendarCell[]; payouts: PayoutLine[]; monthTotal: number }`
  - `employeeCard(row: FotRow, ctx: { month: string; today: string; revenueDates: ReadonlySet<string> }): EmployeeCardModel`
  - `type StaffRevenueRow = { date: string; label: string; weekday: string; other: number; confectionery: number; total: number }`
  - `staffRevenueRows(days: BreakdownDay[]): StaffRevenueRow[]`

- [ ] **Step 1: Падающие тесты дат**

`src/lib/staff/dates.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { todayMoscow, staffMonth, weekdayShort, dayMonth, dayMonthWord, calendarCells } from './dates';

describe('todayMoscow', () => {
  it('ночью по Москве уже следующий день, хотя в UTC ещё вчера', () => {
    expect(todayMoscow(new Date('2026-09-22T22:30:00Z'))).toBe('2026-09-23');
  });
  it('днём совпадает с датой UTC', () => {
    expect(todayMoscow(new Date('2026-09-23T10:00:00Z'))).toBe('2026-09-23');
  });
});

describe('staffMonth', () => {
  const now = new Date('2026-09-23T10:00:00Z');
  it('корректный параметр берётся как есть', () => expect(staffMonth('2026-08', now)).toBe('2026-08'));
  it('мусор, 13-й месяц и пусто → текущий месяц по Москве', () => {
    expect(staffMonth('2026-13', now)).toBe('2026-09');
    expect(staffMonth('abc', now)).toBe('2026-09');
    expect(staffMonth(undefined, now)).toBe('2026-09');
  });
  it('в ночь на 1-е по Москве — уже новый месяц', () => {
    expect(staffMonth(undefined, new Date('2026-09-30T21:30:00Z'))).toBe('2026-10');
  });
});

describe('подписи дат', () => {
  it('день недели, ДД.ММ и «15 сен»', () => {
    expect(weekdayShort('2026-09-01')).toBe('вт');
    expect(weekdayShort('2026-09-07')).toBe('пн');
    expect(dayMonth('2026-09-01')).toBe('01.09');
    expect(dayMonthWord('2026-09-15')).toBe('15 сен');
    expect(dayMonthWord('2026-05-01')).toBe('1 мая');
  });
});

describe('calendarCells', () => {
  it('сентябрь 2026 начинается со вторника — одна пустая ячейка', () => {
    const c = calendarCells('2026-09');
    expect(c[0]).toBeNull();
    expect(c[1]).toBe('2026-09-01');
    expect(c).toHaveLength(31);
  });
  it('1 июня 2026 — понедельник: пустых ячеек нет', () => {
    expect(calendarCells('2026-06')[0]).toBe('2026-06-01');
  });
  it('1 ноября 2026 — воскресенье: шесть пустых', () => {
    const c = calendarCells('2026-11');
    expect(c.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(c[6]).toBe('2026-11-01');
  });
});
```

- [ ] **Step 2: Падающие тесты модели вида**

`src/lib/staff/view-model.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import type { FotEmployee, FotPayment, FotRow } from '@/lib/db/fot-repo';
import { monthDays } from '@/lib/finance/month';
import { dayState, employeeCard, hasBonusScheme, isPreliminary, staffRevenueRows } from './view-model';

const EVG: FotEmployee = { id: 'e', name: 'Евгения', group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300, schedOffset: 0 };
const LYUDA: FotEmployee = { id: 'l', name: 'Людмила', group: 'bakery', role: 'kitchen', brigade: null, basePay: 1500, schedOffset: 0 };

/** Дни месяца: worked — {число → оплата за смену}, остальные дни — выходные. */
function days(month: string, worked: Record<number, number>): FotRow['days'] {
  return monthDays(month).map((date) => {
    const pay = worked[Number(date.slice(8, 10))];
    return { date, present: pay !== undefined, pay: pay ?? 0 };
  });
}
function row(employee: FotEmployee, d: FotRow['days'], payments: FotPayment[] = []): FotRow {
  return { employee, days: d, shifts: d.filter((x) => x.present).length, payTotal: 0, payments, paymentsTotal: payments.reduce((s, p) => s + p.amount, 0) };
}
const pay = (half: 1 | 2, payDate: string, base: number, bonus: number, bonusDates: string[]): FotPayment => ({
  half,
  payDate,
  shifts: 0,
  base,
  bonus,
  amount: base + bonus,
  bonusDates,
});

describe('hasBonusScheme', () => {
  it('премия только у пекарей и кассиров', () => {
    expect(hasBonusScheme('baker')).toBe(true);
    expect(hasBonusScheme('cashier')).toBe(true);
    expect(hasBonusScheme('kitchen')).toBe(false);
    expect(hasBonusScheme('confectioner')).toBe(false);
  });
});

describe('dayState', () => {
  const base = { date: '2026-09-10', present: true, pay: 3100, basePay: 2300, bonusScheme: true, revenueEntered: true, today: '2026-09-20' };
  it('не смена → выходной, даже если выручка есть', () => expect(dayState({ ...base, present: false })).toEqual({ kind: 'off' }));
  it('будущая смена → план', () => expect(dayState({ ...base, date: '2026-09-25', revenueEntered: false })).toEqual({ kind: 'planned' }));
  it('кухня: прошедшая смена без суммы', () =>
    expect(dayState({ ...base, bonusScheme: false, pay: 1500, basePay: 1500 })).toEqual({ kind: 'worked' }));
  it('выручка внесена → премия дня = оплата − база', () => expect(dayState(base)).toEqual({ kind: 'bonus', amount: 800 }));
  it('выручка внесена, до порога не дотянули → +0', () => expect(dayState({ ...base, pay: 2300 })).toEqual({ kind: 'bonus', amount: 0 }));
  it('смена прошла, выручки нет → ждёт выручку', () =>
    expect(dayState({ ...base, pay: 2300, revenueEntered: false })).toEqual({ kind: 'pending' }));
  it('сегодняшняя смена без выручки → ждёт выручку, а не план', () =>
    expect(dayState({ ...base, date: '2026-09-20', pay: 2300, revenueEntered: false })).toEqual({ kind: 'pending' }));
});

describe('isPreliminary', () => {
  const rev = new Set(['2026-08-31', '2026-09-03']);
  const p = { payDate: '2026-09-15', bonusDates: ['2026-08-31', '2026-09-03'] };
  it('дата выплаты впереди → предварительно', () =>
    expect(isPreliminary(p, { today: '2026-09-14', bonusScheme: true, revenueDates: rev })).toBe(true));
  it('день выплаты, все премии посчитаны → окончательно', () =>
    expect(isPreliminary(p, { today: '2026-09-15', bonusScheme: true, revenueDates: rev })).toBe(false));
  it('нет выручки за день из прошлого месяца → предварительно', () =>
    expect(isPreliminary(p, { today: '2026-09-20', bonusScheme: true, revenueDates: new Set(['2026-09-03']) })).toBe(true));
  it('у кухни выручка на выплату не влияет', () =>
    expect(isPreliminary(p, { today: '2026-09-20', bonusScheme: false, revenueDates: new Set() })).toBe(false));
});

describe('employeeCard', () => {
  it('Евгения, сентябрь: подпись, календарь с понедельника, выплата', () => {
    const r = row(EVG, days('2026-09', { 3: 3100, 4: 3100, 20: 2300, 21: 2300 }), [pay(1, '2026-09-15', 16100, 5400, ['2026-08-31', '2026-09-03', '2026-09-04'])]);
    const c = employeeCard(r, { month: '2026-09', today: '2026-09-20', revenueDates: new Set(['2026-08-31', '2026-09-03', '2026-09-04']) });
    expect(c).toMatchObject({ id: 'e', name: 'Евгения', subtitle: 'пекарь · бригада A', monthTotal: 21500 });
    expect(c.cells[0]).toBeNull(); // 1 сентября 2026 — вторник
    expect(c.cells[1]).toEqual({ date: '2026-09-01', day: 1, state: { kind: 'off' } });
    expect(c.cells[3]?.state).toEqual({ kind: 'bonus', amount: 800 });
    expect(c.cells[20]?.state).toEqual({ kind: 'pending' }); // сегодня, выручки ещё нет
    expect(c.cells[21]?.state).toEqual({ kind: 'planned' });
    expect(c.payouts).toEqual([
      { half: 1, title: '1-я выплата · 15 сен', amount: 21500, base: 16100, bonus: 5400, showBonus: true, preliminary: false },
    ]);
  });

  it('смен в месяце нет → ни одной выплаты, все дни выходные', () => {
    const c = employeeCard(row(EVG, days('2026-09', {})), { month: '2026-09', today: '2026-09-20', revenueDates: new Set() });
    expect(c.payouts).toEqual([]);
    expect(c.monthTotal).toBe(0);
    expect(c.cells.every((x) => x === null || x.state.kind === 'off')).toBe(true);
  });

  it('Людмила (кухня): смены без суммы, выплата без премий и без «предварительно» из-за выручки', () => {
    const r = row(LYUDA, days('2026-09', { 1: 1500, 2: 1500 }), [pay(1, '2026-09-15', 16500, 0, ['2026-08-31', '2026-09-01'])]);
    const c = employeeCard(r, { month: '2026-09', today: '2026-09-20', revenueDates: new Set() });
    expect(c.subtitle).toBe('кухня');
    expect(c.cells[1]?.state).toEqual({ kind: 'worked' });
    expect(c.payouts[0]).toMatchObject({ showBonus: false, preliminary: false });
  });

  it('будущий месяц: все смены — план, выплата предварительная', () => {
    const r = row(EVG, days('2026-10', { 1: 2300, 2: 2300 }), [pay(1, '2026-10-14', 4600, 0, ['2026-09-28', '2026-10-01'])]);
    const c = employeeCard(r, { month: '2026-10', today: '2026-09-23', revenueDates: new Set() });
    const shifts = c.cells.filter((x) => x !== null && x.state.kind !== 'off');
    expect(shifts).toHaveLength(2);
    expect(shifts.every((x) => x!.state.kind === 'planned')).toBe(true);
    expect(c.payouts[0].preliminary).toBe(true);
  });

  it('прошедший месяц целиком внесён: ни «…», ни «предварительно»', () => {
    const r = row(EVG, days('2026-08', { 30: 3100, 31: 3100 }), [pay(2, '2026-08-31', 4600, 800, ['2026-08-30'])]);
    const c = employeeCard(r, { month: '2026-08', today: '2026-09-23', revenueDates: new Set(['2026-08-30', '2026-08-31']) });
    expect(c.cells.some((x) => x?.state.kind === 'pending')).toBe(false);
    expect(c.payouts[0].preliminary).toBe(false);
  });
});

describe('staffRevenueRows', () => {
  it('дата, день недели и суммы как есть', () => {
    expect(staffRevenueRows([{ date: '2026-09-01', confectionery: 132929, other: 45114, total: 178043 }])).toEqual([
      { date: '2026-09-01', label: '01.09', weekday: 'вт', other: 45114, confectionery: 132929, total: 178043 },
    ]);
  });
});
```

- [ ] **Step 3: Убедиться, что падают**

Run: `npx vitest run src/lib/staff`
Expected: FAIL — `Failed to resolve import "./dates"` и `"./view-model"`.

- [ ] **Step 4: Реализация дат**

`src/lib/staff/dates.ts`:

```ts
import { monthDays } from '@/lib/finance/month';

const MSK_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS_GEN = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Сегодня по Москве, 'YYYY-MM-DD'. Сервер живёт в UTC — с 00:00 до 03:00 МСК его дата отстаёт на день. */
export function todayMoscow(now: Date): string {
  return MSK_DATE.format(now);
}

/** Месяц из ?month=YYYY-MM; пусто или мусор — текущий месяц по Москве. */
export function staffMonth(raw: string | undefined, now: Date): string {
  return raw !== undefined && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : todayMoscow(now).slice(0, 7);
}

const utcWeekday = (iso: string) => new Date(`${iso}T00:00:00.000Z`).getUTCDay();

export function weekdayShort(iso: string): string {
  return WEEKDAYS[utcWeekday(iso)];
}

export function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

export function dayMonthWord(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS_GEN[Number(iso.slice(5, 7)) - 1]}`;
}

/** Ячейки календаря месяца с понедельника: пустые до 1-го числа, дальше все даты месяца. */
export function calendarCells(month: string): (string | null)[] {
  const days = monthDays(month);
  const lead = (utcWeekday(days[0]) + 6) % 7;
  return [...Array.from({ length: lead }, () => null), ...days];
}
```

- [ ] **Step 5: Реализация модели вида**

`src/lib/staff/view-model.ts`:

```ts
import type { FotEmployee, FotRow } from '@/lib/db/fot-repo';
import type { BreakdownDay } from '@/lib/db/breakdown-repo';
import { calendarCells, dayMonth, dayMonthWord, weekdayShort } from './dates';

export type DayState = { kind: 'off' } | { kind: 'planned' } | { kind: 'worked' } | { kind: 'bonus'; amount: number } | { kind: 'pending' };

type Role = FotEmployee['role'];

/** Премия бывает только у пекарей и кассиров; у кухни и кондитеров — одна база. */
export function hasBonusScheme(role: Role): boolean {
  return role === 'baker' || role === 'cashier';
}

/** Состояние дня в календаре сотрудника — правила по порядку из раздела 4 спеки. */
export function dayState(a: { date: string; present: boolean; pay: number; basePay: number; bonusScheme: boolean; revenueEntered: boolean; today: string }): DayState {
  if (!a.present) return { kind: 'off' };
  if (a.date > a.today) return { kind: 'planned' };
  if (!a.bonusScheme) return { kind: 'worked' };
  if (a.revenueEntered) return { kind: 'bonus', amount: a.pay - a.basePay };
  return { kind: 'pending' };
}

/** «Предварительно»: выплата ещё впереди или за день какой-то из её премий нет выручки. */
export function isPreliminary(p: { payDate: string; bonusDates: string[] }, a: { today: string; bonusScheme: boolean; revenueDates: ReadonlySet<string> }): boolean {
  return p.payDate > a.today || (a.bonusScheme && p.bonusDates.some((d) => !a.revenueDates.has(d)));
}

export type CalendarCell = { date: string; day: number; state: DayState } | null;
export type PayoutLine = { half: 1 | 2; title: string; amount: number; base: number; bonus: number; showBonus: boolean; preliminary: boolean };
export type EmployeeCardModel = { id: string; name: string; subtitle: string; cells: CalendarCell[]; payouts: PayoutLine[]; monthTotal: number };

const ROLE_LABEL: Record<Role, string> = { baker: 'пекарь', cashier: 'кассир', kitchen: 'кухня', confectioner: 'кондитер' };

export function employeeCard(row: FotRow, ctx: { month: string; today: string; revenueDates: ReadonlySet<string> }): EmployeeCardModel {
  const e = row.employee;
  const bonusScheme = hasBonusScheme(e.role);
  const byDate = new Map(row.days.map((d) => [d.date, d]));
  const cells: CalendarCell[] = calendarCells(ctx.month).map((date) => {
    if (date === null) return null;
    const d = byDate.get(date);
    const state = dayState({
      date,
      present: d?.present ?? false,
      pay: d?.pay ?? 0,
      basePay: e.basePay,
      bonusScheme,
      revenueEntered: ctx.revenueDates.has(date),
      today: ctx.today,
    });
    return { date, day: Number(date.slice(8, 10)), state };
  });
  const payouts: PayoutLine[] = row.payments.map((p) => ({
    half: p.half,
    title: `${p.half}-я выплата · ${dayMonthWord(p.payDate)}`,
    amount: p.amount,
    base: p.base,
    bonus: p.bonus,
    showBonus: bonusScheme,
    preliminary: isPreliminary(p, { today: ctx.today, bonusScheme, revenueDates: ctx.revenueDates }),
  }));
  const subtitle = bonusScheme && e.brigade ? `${ROLE_LABEL[e.role]} · бригада ${e.brigade}` : ROLE_LABEL[e.role];
  return { id: e.id, name: e.name, subtitle, cells, payouts, monthTotal: row.paymentsTotal };
}

export type StaffRevenueRow = { date: string; label: string; weekday: string; other: number; confectionery: number; total: number };

export function staffRevenueRows(days: BreakdownDay[]): StaffRevenueRow[] {
  return days.map((d) => ({ date: d.date, label: dayMonth(d.date), weekday: weekdayShort(d.date), other: d.other, confectionery: d.confectionery, total: d.total }));
}
```

- [ ] **Step 6: Тесты зелёные**

Run: `npx vitest run src/lib/staff && npx tsc --noEmit`
Expected: PASS, `tsc` без ошибок.

- [ ] **Step 7: Коммит**

```bash
git add src/lib/staff
git commit -m "feat(staff): даты по Москве и модель вида для вкладок сотрудников

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Оболочка сотрудника и вкладка «Выручка»

**Files:**
- Modify: `src/app/AppShell.tsx` — пропустить меню владельца на `/staff/**`
- Create: `src/app/staff/layout.tsx`
- Create: `src/app/staff/_chrome.tsx`
- Create: `src/app/staff/_views.tsx`
- Create: `src/app/staff/page.tsx`
- Create: `scripts/render-staff-preview.tsx`
- Modify: `.gitignore` — добавить `/.preview/`

**Interfaces:**
- Consumes: `roleOf` (Task 1); `staffMonth` (Task 4); `staffRevenueRows`, `StaffRevenueRow` (Task 4); `loadBreakdown(prisma, month): Promise<{ days: BreakdownDay[]; totals: … }>` из `@/lib/db/breakdown-repo`; `monthLabel`, `prevMonth`, `nextMonth` из `@/lib/finance/month`.
- Produces:
  - `StaffPage({ tab: 'revenue' | 'shifts'; title: string; month: string; showOwnerLink: boolean; children: React.ReactNode })` из `src/app/staff/_chrome.tsx`
  - константы `PIES = '#1a4633'`, `CONF_INK = '#4c805a'`, функция `rub(n: number): string` оттуда же
  - `RevenueView({ month: string; rows: StaffRevenueRow[]; showOwnerLink: boolean })` из `src/app/staff/_views.tsx`
  - в `_views.tsx` константа стиля `cardStyle: React.CSSProperties` (переиспользует Task 6)

Все компоненты `/staff` — синхронные серверные компоненты на inline-стилях и обычных `<a href>`: так их можно отрендерить на фикстурах вне Next (превью), а на страницу не уходит ни строчки клиентского JS с данными.

- [ ] **Step 1: Оболочка владельца не рисуется на вкладках сотрудника**

В `src/app/AppShell.tsx` сразу после строки `if (!authed) return <>{children}</>;` добавить:

```tsx
  // Вкладки сотрудников — своя оболочка под телефон (src/app/staff), без меню владельца.
  if (pathname === '/staff' || pathname.startsWith('/staff/')) return <>{children}</>;
```

- [ ] **Step 2: Раскладка раздела**

`src/app/staff/layout.tsx`:

```tsx
import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = { title: 'Nikas Cafe · Сотрудникам' };
export const viewport: Viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover' };

export default function StaffLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
```

- [ ] **Step 3: Шапка, переключатель месяца и нижнее меню**

`src/app/staff/_chrome.tsx`:

```tsx
import { monthLabel, nextMonth, prevMonth } from '@/lib/finance/month';

export const PIES = '#1a4633';
export const CONF_INK = '#4c805a';
export const rub = (n: number) => Math.round(n).toLocaleString('ru-RU');

type Tab = 'revenue' | 'shifts';
const TABS: { key: Tab; href: string; label: string }[] = [
  { key: 'revenue', href: '/staff', label: 'Выручка' },
  { key: 'shifts', href: '/staff/shifts', label: 'Смены и ЗП' },
];

const arrow: React.CSSProperties = { width: 44, height: 44, display: 'grid', placeItems: 'center', color: 'var(--muted)', fontSize: 22, fontWeight: 700 };

export function StaffPage({ tab, title, month, showOwnerLink, children }: { tab: Tab; title: string; month: string; showOwnerLink: boolean; children: React.ReactNode }) {
  const base = TABS.find((t) => t.key === tab)!.href;
  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bg)', paddingBottom: 'calc(72px + env(safe-area-inset-bottom))' }}>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 14px' }}>
        <header style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bg)', padding: 'calc(env(safe-area-inset-top) + 12px) 0 10px' }}>
          {showOwnerLink && (
            <a href="/" style={{ display: 'inline-block', fontSize: 13, fontWeight: 700, color: 'var(--muted)', padding: '4px 0 8px' }}>
              ← к учёту
            </a>
          )}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
            <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: '-0.02em', color: 'var(--ink)' }}>{title}</h1>
            <nav aria-label="Месяц" style={{ display: 'flex', alignItems: 'center', background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 14 }}>
              <a href={`${base}?month=${prevMonth(month)}`} aria-label="Предыдущий месяц" style={arrow}>‹</a>
              <span style={{ fontSize: 14, fontWeight: 700, color: 'var(--ink)', minWidth: 104, textAlign: 'center' }}>{monthLabel(month)}</span>
              <a href={`${base}?month=${nextMonth(month)}`} aria-label="Следующий месяц" style={arrow}>›</a>
            </nav>
          </div>
        </header>
        <main>{children}</main>
      </div>
      <nav
        aria-label="Вкладки"
        style={{ position: 'fixed', left: 0, right: 0, bottom: 0, zIndex: 10, background: 'var(--card)', borderTop: '1px solid var(--line)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex' }}>
          {TABS.map((t) => {
            const on = t.key === tab;
            return (
              <a
                key={t.key}
                href={`${t.href}?month=${month}`}
                aria-current={on ? 'page' : undefined}
                style={{
                  flex: 1,
                  minHeight: 56,
                  display: 'grid',
                  placeItems: 'center',
                  fontSize: 14,
                  fontWeight: on ? 800 : 600,
                  color: on ? 'var(--profit)' : 'var(--muted)',
                  borderTop: `3px solid ${on ? 'var(--profit)' : 'transparent'}`,
                }}
              >
                {t.label}
              </a>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
```

- [ ] **Step 4: Вид вкладки «Выручка»**

`src/app/staff/_views.tsx`:

```tsx
import type { StaffRevenueRow } from '@/lib/staff/view-model';
import { CONF_INK, PIES, StaffPage, rub } from './_chrome';

export const cardStyle: React.CSSProperties = { background: 'var(--card)', border: '1px solid var(--line)', borderRadius: 16 };
const emptyStyle: React.CSSProperties = { ...cardStyle, padding: 16, fontSize: 14, fontWeight: 600, color: 'var(--muted)' };
const noteStyle: React.CSSProperties = { fontSize: 12.5, fontWeight: 600, color: 'var(--muted)', lineHeight: 1.5, margin: '0 2px 10px' };
const th: React.CSSProperties = { textAlign: 'right', padding: '8px 0', fontSize: 12, fontWeight: 700, color: 'var(--muted)' };
const num: React.CSSProperties = { textAlign: 'right', padding: '10px 0 10px 6px', fontSize: 14, fontWeight: 700, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' };

export function RevenueView({ month, rows, showOwnerLink }: { month: string; rows: StaffRevenueRow[]; showOwnerLink: boolean }) {
  return (
    <StaffPage tab="revenue" title="Выручка" month={month} showOwnerLink={showOwnerLink}>
      <p style={noteStyle}>Плюшкино, по дням. «Пироги» — всё, кроме кондитерки.</p>
      {rows.length === 0 ? (
        <div style={emptyStyle}>За этот месяц выручки пока нет.</div>
      ) : (
        <div style={{ ...cardStyle, padding: '4px 12px' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', tableLayout: 'fixed' }}>
            <thead>
              <tr>
                <th style={{ ...th, textAlign: 'left', width: '30%' }}>Дата</th>
                <th style={th}>Пироги</th>
                <th style={th}>Конд.</th>
                <th style={th}>Всего</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.date} style={{ borderTop: '1px solid var(--line)' }}>
                  <td style={{ padding: '10px 0', fontSize: 14, fontWeight: 700, color: 'var(--ink)', whiteSpace: 'nowrap' }}>
                    {r.label} <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)' }}>{r.weekday}</span>
                  </td>
                  <td style={{ ...num, color: PIES }}>{rub(r.other)}</td>
                  <td style={{ ...num, color: CONF_INK }}>{rub(r.confectionery)}</td>
                  <td style={{ ...num, color: 'var(--ink)', fontWeight: 800 }}>{rub(r.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </StaffPage>
  );
}
```

- [ ] **Step 5: Страница**

`src/app/staff/page.tsx`:

```tsx
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { loadBreakdown } from '@/lib/db/breakdown-repo';
import { roleOf } from '@/lib/auth/roles';
import { staffMonth } from '@/lib/staff/dates';
import { staffRevenueRows } from '@/lib/staff/view-model';
import { RevenueView } from './_views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function StaffRevenuePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const month = staffMonth((await searchParams).month, new Date());
  const [session, v] = await Promise.all([auth(), loadBreakdown(getPrisma(), month)]);
  // В страницу уходят только дни — итоги месяца (v.totals) сотрудникам не отдаём.
  return <RevenueView month={month} rows={staffRevenueRows(v.days)} showOwnerLink={roleOf(session) === 'owner'} />;
}
```

- [ ] **Step 6: Превью без входа и без БД**

В `.gitignore` в конец добавить:

```
# превью вкладок сотрудников (scripts/render-staff-preview.tsx)
/.preview/
```

`scripts/render-staff-preview.tsx`:

```tsx
// Превью вкладок сотрудников без входа и без БД: рендер на фикстурах в статический HTML.
// Запуск: npx tsx scripts/render-staff-preview.tsx [папка]   (по умолчанию .preview/staff)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { RevenueView } from '../src/app/staff/_views';
import { staffRevenueRows } from '../src/lib/staff/view-model';

const out = process.argv[2] ?? '.preview/staff';
const css = readFileSync('src/app/globals.css', 'utf8');
const page = (title: string, body: string) =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${title}</title>` +
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap">` +
  `<style>${css}\n:root{--font-manrope:'Manrope'}</style></head><body>${body}</body></html>`;

// Реальная выручка Плюшкино 1–9 сентября 2026: [дата, кондитерка, пироги+прочее].
const REVENUE: [string, number, number][] = [
  ['2026-09-01', 132929, 45114],
  ['2026-09-02', 13696, 25627],
  ['2026-09-03', 21563, 31978],
  ['2026-09-04', 22500, 31343],
  ['2026-09-05', 30768, 30637],
  ['2026-09-06', 14273, 31028],
  ['2026-09-07', 8969, 29703],
  ['2026-09-08', 28762, 36284],
  ['2026-09-09', 31729, 36467],
];
const days = REVENUE.map(([date, confectionery, other]) => ({ date, confectionery, other, total: confectionery + other }));
const rows = staffRevenueRows(days);

mkdirSync(out, { recursive: true });
const revenue = renderToStaticMarkup(<RevenueView month="2026-09" rows={rows} showOwnerLink={false} />);
const monthTotal = Math.round(days.reduce((s, d) => s + d.total, 0)).toLocaleString('ru-RU');
if (revenue.includes(monthTotal)) throw new Error(`итог месяца ${monthTotal} попал на вкладку «Выручка»`);
if (revenue.includes('к учёту')) throw new Error('ссылка владельца видна сотруднику');
writeFileSync(path.join(out, 'revenue.html'), page('Выручка', revenue));
writeFileSync(path.join(out, 'revenue-owner.html'), page('Выручка (владелец)', renderToStaticMarkup(<RevenueView month="2026-09" rows={rows} showOwnerLink />)));
writeFileSync(path.join(out, 'revenue-empty.html'), page('Выручка (пусто)', renderToStaticMarkup(<RevenueView month="2026-10" rows={[]} showOwnerLink={false} />)));
console.log(`Готово: ${out}/revenue.html, revenue-owner.html, revenue-empty.html`);
```

Run: `npx tsx scripts/render-staff-preview.tsx`
Expected: `Готово: .preview/staff/revenue.html, revenue-owner.html, revenue-empty.html`; исключений нет.

- [ ] **Step 7: Проверки**

Run: `npm test && npx tsc --noEmit && npx eslint src/lib src/app scripts/render-staff-preview.tsx`
Expected: всё зелёное.

- [ ] **Step 8: Коммит**

```bash
git add .gitignore src/app/AppShell.tsx src/app/staff scripts/render-staff-preview.tsx
git commit -m "feat(staff): оболочка под телефон и вкладка «Выручка» для сотрудников

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: Вкладка «Смены и ЗП»

**Files:**
- Modify: `src/app/staff/_views.tsx` — добавить `ShiftsView` и внутренние `DayCell`, `Payout`, `EmployeeCard`
- Create: `src/app/staff/shifts/page.tsx`
- Modify: `scripts/render-staff-preview.tsx` — заменить целиком (добавляется превью смен)

**Interfaces:**
- Consumes: `StaffPage`, `rub` (Task 5, `_chrome.tsx`); `cardStyle` (Task 5, `_views.tsx`); `employeeCard`, `EmployeeCardModel`, `CalendarCell`, `PayoutLine` (Task 4); `staffMonth`, `todayMoscow` (Task 4); `loadFot(prisma, month)` → `FotView` с `bakery`, `revenueDates` (Task 3); `buildFot`, `FotEmployee` (для превью); `bonusColor(bonus): string | null` из `@/lib/fot/bonus-colors`; `roleOf` (Task 1).
- Produces: `ShiftsView({ month: string; cards: EmployeeCardModel[]; showOwnerLink: boolean })` из `src/app/staff/_views.tsx`.

- [ ] **Step 1: Вид вкладки «Смены и ЗП»**

В `src/app/staff/_views.tsx`:

1. Заменить первые две строки импортов на:

```tsx
import type { CalendarCell, EmployeeCardModel, PayoutLine, StaffRevenueRow } from '@/lib/staff/view-model';
import { bonusColor } from '@/lib/fot/bonus-colors';
import { CONF_INK, PIES, StaffPage, rub } from './_chrome';
```

2. В конец файла добавить:

```tsx
const WEEK = ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'вс'];
// На тёмных фонах премий (фиолетовый, красный, чёрный) подпись белая, на светлых — цвет текста.
const LIGHT_TEXT_BONUS = new Set([500, 800, 1200]);
const cellBox: React.CSSProperties = { minHeight: 44, borderRadius: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', lineHeight: 1.15 };

function DayCell({ cell }: { cell: CalendarCell }) {
  if (cell === null) return <div />;
  const day = <span style={{ fontSize: 13, fontWeight: 700 }}>{cell.day}</span>;
  const note = (text: string) => <span style={{ fontSize: 11, fontWeight: 700 }}>{text}</span>;
  const s = cell.state;
  switch (s.kind) {
    case 'off':
      return <div style={{ ...cellBox, color: '#b4bcb8' }}>{day}</div>;
    case 'planned':
      return <div style={{ ...cellBox, border: `1.5px dashed ${PIES}`, color: PIES }}>{day}{note('план')}</div>;
    case 'pending':
      return <div style={{ ...cellBox, border: '1.5px solid #cfd8d3', color: 'var(--ink)' }}>{day}{note('…')}</div>;
    case 'worked':
      return <div style={{ ...cellBox, background: 'var(--chip)', color: 'var(--ink)' }}>{day}</div>;
    case 'bonus': {
      const bg = s.amount > 0 ? bonusColor(s.amount) : null;
      const color = bg && LIGHT_TEXT_BONUS.has(s.amount) ? '#fff' : 'var(--ink)';
      return <div style={{ ...cellBox, background: bg ?? 'var(--chip)', color }}>{day}{note(`+${s.amount}`)}</div>;
    }
  }
}

function Payout({ p }: { p: PayoutLine }) {
  return (
    <div style={{ padding: '8px 0', borderTop: '1px solid var(--line)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}>
        <span>{p.title}</span>
        <span style={{ fontWeight: 800, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{rub(p.amount)} ₽</span>
      </div>
      <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--muted)', marginTop: 2 }}>
        база {rub(p.base)}
        {p.showBonus ? ` + премии ${rub(p.bonus)}` : ''}
        {p.preliminary && <span style={{ color: '#8a5a12' }}> · предварительно</span>}
      </div>
    </div>
  );
}

function EmployeeCard({ card }: { card: EmployeeCardModel }) {
  const grid: React.CSSProperties = { display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))', gap: 4 };
  return (
    <section id={`emp-${card.id}`} style={{ ...cardStyle, padding: 14, marginBottom: 12, scrollMarginTop: 'calc(env(safe-area-inset-top) + 80px)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 8, marginBottom: 10 }}>
        <h2 style={{ fontSize: 17, fontWeight: 800, color: 'var(--ink)' }}>{card.name}</h2>
        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--muted)' }}>{card.subtitle}</span>
      </div>
      <div style={{ ...grid, marginBottom: 4 }}>
        {WEEK.map((w) => (
          <div key={w} style={{ textAlign: 'center', fontSize: 11, fontWeight: 700, color: 'var(--muted)' }}>{w}</div>
        ))}
      </div>
      <div style={grid}>
        {card.cells.map((c, i) => (
          <DayCell key={c?.date ?? `pad-${i}`} cell={c} />
        ))}
      </div>
      <div style={{ marginTop: 12 }}>
        {card.payouts.length === 0 ? (
          <div style={{ paddingTop: 8, borderTop: '1px solid var(--line)', fontSize: 13.5, fontWeight: 600, color: 'var(--muted)' }}>Смен в этом месяце нет.</div>
        ) : (
          <>
            {card.payouts.map((p) => (
              <Payout key={p.half} p={p} />
            ))}
            <div style={{ display: 'flex', justifyContent: 'space-between', paddingTop: 8, borderTop: '1px solid var(--line)', fontSize: 14.5, fontWeight: 800, color: 'var(--profit)' }}>
              <span>За месяц</span>
              <span style={{ fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{rub(card.monthTotal)} ₽</span>
            </div>
          </>
        )}
      </div>
    </section>
  );
}

export function ShiftsView({ month, cards, showOwnerLink }: { month: string; cards: EmployeeCardModel[]; showOwnerLink: boolean }) {
  return (
    <StaffPage tab="shifts" title="Смены и ЗП" month={month} showOwnerLink={showOwnerLink}>
      {cards.length === 0 ? (
        <div style={emptyStyle}>Сотрудников пекарни пока нет.</div>
      ) : (
        <>
          <nav aria-label="Сотрудники" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
            {cards.map((c) => (
              <a
                key={c.id}
                href={`#emp-${c.id}`}
                style={{ minHeight: 44, display: 'inline-flex', alignItems: 'center', padding: '0 14px', borderRadius: 999, background: 'var(--card)', border: '1px solid var(--line)', fontSize: 14, fontWeight: 700, color: 'var(--ink)' }}
              >
                {c.name}
              </a>
            ))}
          </nav>
          <p style={{ ...noteStyle, marginBottom: 12 }}>
            Премия за смену в день выплаты переходит в следующую выплату — в этот день выручка ещё не известна. Пунктир — смена по графику, «…» — выручку за день ещё не внесли.
          </p>
          {cards.map((c) => (
            <EmployeeCard key={c.id} card={c} />
          ))}
        </>
      )}
    </StaffPage>
  );
}
```

- [ ] **Step 2: Страница**

`src/app/staff/shifts/page.tsx`:

```tsx
import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { loadFot } from '@/lib/db/fot-repo';
import { roleOf } from '@/lib/auth/roles';
import { staffMonth, todayMoscow } from '@/lib/staff/dates';
import { employeeCard } from '@/lib/staff/view-model';
import { ShiftsView } from '../_views';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export default async function StaffShiftsPage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const now = new Date();
  const month = staffMonth((await searchParams).month, now);
  const [session, v] = await Promise.all([auth(), loadFot(getPrisma(), month)]);
  const ctx = { month, today: todayMoscow(now), revenueDates: new Set(v.revenueDates) };
  // Только карточки пекарни: итоги (v.totals), кондитерка и фикс-выплаты сотрудникам не отдаются.
  const cards = v.bakery.map((row) => employeeCard(row, ctx));
  return <ShiftsView month={month} cards={cards} showOwnerLink={roleOf(session) === 'owner'} />;
}
```

- [ ] **Step 3: Превью обеих вкладок**

`scripts/render-staff-preview.tsx` заменить целиком:

```tsx
// Превью вкладок сотрудников без входа и без БД: рендер на фикстурах в статический HTML.
// Запуск: npx tsx scripts/render-staff-preview.tsx [папка]   (по умолчанию .preview/staff)
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderToStaticMarkup } from 'react-dom/server';
import { RevenueView, ShiftsView } from '../src/app/staff/_views';
import { staffRevenueRows, employeeCard } from '../src/lib/staff/view-model';
import { buildFot, type FotEmployee } from '../src/lib/db/fot-repo';
import { monthDays } from '../src/lib/finance/month';

const out = process.argv[2] ?? '.preview/staff';
const css = readFileSync('src/app/globals.css', 'utf8');
const page = (title: string, body: string) =>
  `<!doctype html><html lang="ru"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover"><title>${title}</title>` +
  `<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;600;700;800&display=swap">` +
  `<style>${css}\n:root{--font-manrope:'Manrope'}</style></head><body>${body}</body></html>`;
const fail = (msg: string) => {
  throw new Error(msg);
};

mkdirSync(out, { recursive: true });

// ── «Выручка»: реальная выручка Плюшкино 1–9 сентября 2026: [дата, кондитерка, пироги+прочее].
const REVENUE: [string, number, number][] = [
  ['2026-09-01', 132929, 45114],
  ['2026-09-02', 13696, 25627],
  ['2026-09-03', 21563, 31978],
  ['2026-09-04', 22500, 31343],
  ['2026-09-05', 30768, 30637],
  ['2026-09-06', 14273, 31028],
  ['2026-09-07', 8969, 29703],
  ['2026-09-08', 28762, 36284],
  ['2026-09-09', 31729, 36467],
];
const days = REVENUE.map(([date, confectionery, other]) => ({ date, confectionery, other, total: confectionery + other }));
const rows = staffRevenueRows(days);
const revenue = renderToStaticMarkup(<RevenueView month="2026-09" rows={rows} showOwnerLink={false} />);
const revenueTotal = Math.round(days.reduce((s, d) => s + d.total, 0)).toLocaleString('ru-RU');
if (revenue.includes(revenueTotal)) fail(`итог месяца ${revenueTotal} попал на вкладку «Выручка»`);
if (revenue.includes('к учёту')) fail('ссылка владельца видна сотруднику');
writeFileSync(path.join(out, 'revenue.html'), page('Выручка', revenue));
writeFileSync(path.join(out, 'revenue-owner.html'), page('Выручка (владелец)', renderToStaticMarkup(<RevenueView month="2026-09" rows={rows} showOwnerLink />)));
writeFileSync(path.join(out, 'revenue-empty.html'), page('Выручка (пусто)', renderToStaticMarkup(<RevenueView month="2026-10" rows={[]} showOwnerLink={false} />)));

// ── «Смены и ЗП»: состав пекарни и реальная выручка 29.08–15.09.2026 (как в fot-repo.test.ts);
// 16–19.09 — синтетика для превью; 20.09 и позже выручки нет → «…» и «план».
const EMPLOYEES: FotEmployee[] = [
  { id: 'katya', name: 'Катя', group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300, schedOffset: 0 },
  { id: 'evg', name: 'Евгения', group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300, schedOffset: 0 },
  { id: 'natasha', name: 'Наташа', group: 'bakery', role: 'cashier', brigade: 'A', basePay: 2100, schedOffset: 0 },
  { id: 'alena', name: 'Алёна', group: 'bakery', role: 'baker', brigade: 'B', basePay: 2300, schedOffset: 0 },
  { id: 'valya', name: 'Валентина', group: 'bakery', role: 'baker', brigade: 'B', basePay: 2300, schedOffset: 0 },
  { id: 'kristina', name: 'Кристина', group: 'bakery', role: 'cashier', brigade: 'B', basePay: 2100, schedOffset: 0 },
  { id: 'lyuda', name: 'Людмила', group: 'bakery', role: 'kitchen', brigade: null, basePay: 1500, schedOffset: 0 },
];
const REV = new Map<string, { total: number; pies: number }>([
  ['2026-08-29', { total: 44856.5, pies: 22462.5 }],
  ['2026-08-30', { total: 49553.9, pies: 31092.9 }],
  ['2026-08-31', { total: 64994.3, pies: 31643.3 }],
  ['2026-09-01', { total: 178043.15, pies: 45114.15 }],
  ['2026-09-02', { total: 39323.4, pies: 25627.4 }],
  ['2026-09-03', { total: 53541.25, pies: 31978.25 }],
  ['2026-09-04', { total: 53843.35, pies: 31343.35 }],
  ['2026-09-05', { total: 61405.3, pies: 30637.3 }],
  ['2026-09-06', { total: 45301.45, pies: 31028.45 }],
  ['2026-09-07', { total: 38672.45, pies: 29703.45 }],
  ['2026-09-08', { total: 65046.15, pies: 36284.15 }],
  ['2026-09-09', { total: 68196.35, pies: 36467.35 }],
  ['2026-09-10', { total: 57385.9, pies: 30900.9 }],
  ['2026-09-11', { total: 71836.3, pies: 44985.3 }],
  ['2026-09-12', { total: 49026.75, pies: 24415.75 }],
  ['2026-09-13', { total: 55584.3, pies: 32845.3 }],
  ['2026-09-14', { total: 51178.9, pies: 33394.9 }],
  ['2026-09-15', { total: 60406.7, pies: 38406.7 }],
  ['2026-09-16', { total: 58000, pies: 31500 }],
  ['2026-09-17', { total: 62000, pies: 37000 }],
  ['2026-09-18', { total: 61500, pies: 36500 }],
  ['2026-09-19', { total: 52000, pies: 27000 }],
]);
const v = buildFot({ month: '2026-09', monthDays: monthDays('2026-09'), employees: EMPLOYEES, revenueByDate: REV, overrides: new Map() });
const ctx = { month: '2026-09', today: '2026-09-21', revenueDates: new Set(v.revenueDates) };
const cards = v.bakery.map((row) => employeeCard(row, ctx));
const first = (id: string) => cards.find((c) => c.id === id)?.payouts[0]?.amount;
if (first('evg') !== 21500) fail(`эталон Евгении: ждали 21 500, получили ${first('evg')}`);
if (first('alena') !== 23600) fail(`эталон Алёны: ждали 23 600, получили ${first('alena')}`);
const shifts = renderToStaticMarkup(<ShiftsView month="2026-09" cards={cards} showOwnerLink={false} />);
for (const total of [v.totals.bakeryTotal, v.totals.bakeryPay1, v.totals.bakeryPay2]) {
  const s = Math.round(total).toLocaleString('ru-RU');
  if (shifts.includes(s)) fail(`итог пекарни ${s} попал на вкладку «Смены и ЗП»`);
}
writeFileSync(path.join(out, 'shifts.html'), page('Смены и ЗП', shifts));
console.log(`Готово: ${out}/revenue.html, revenue-owner.html, revenue-empty.html, shifts.html`);
```

Run: `npx tsx scripts/render-staff-preview.tsx`
Expected: `Готово: .preview/staff/revenue.html, revenue-owner.html, revenue-empty.html, shifts.html`; исключений нет (эталоны 21 500 и 23 600 сошлись, итогов пекарни в HTML нет).

- [ ] **Step 4: Проверки**

Run: `npm test && npx tsc --noEmit && npx eslint src/lib src/app scripts/render-staff-preview.tsx`
Expected: всё зелёное.

- [ ] **Step 5: Коммит**

```bash
git add src/app/staff scripts/render-staff-preview.tsx
git commit -m "feat(staff): вкладка «Смены и ЗП» — карточка на человека, календарь премий, выплаты

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Финальная проверка

**Files:** без изменений, если всё зелёное. Любая правка по итогам проверки — отдельным коммитом с объяснением.

**Interfaces:**
- Consumes: всё из Task 1–6.
- Produces: зелёная сборка и файлы превью `.preview/staff/*.html` для визуальной приёмки.

- [ ] **Step 1: Полный набор проверок**

Run: `npm test && npx tsc --noEmit && npx eslint src/lib src/app scripts/render-staff-preview.tsx && npm run build`
Expected: тесты зелёные, `tsc` и `eslint` чистые, `npm run build` собирает маршруты `/staff` и `/staff/shifts` (оба `ƒ (Dynamic)`). `npm run build` затирает `.next` дев-сервера — это нормально.

- [ ] **Step 2: Утечки итогов в серверный код страниц**

Run: `grep -nE "totals|dailyTotal|confectionery\b|fixed" src/app/staff/page.tsx src/app/staff/shifts/page.tsx`
Expected: совпадения только в комментариях («итоги … не отдаём»), ни одного обращения к полям.

- [ ] **Step 3: Превью**

Run: `npx tsx scripts/render-staff-preview.tsx`
Expected: четыре HTML-файла в `.preview/staff/`, исключений нет. Визуальную приёмку на ширине 375 и 1280 px делает контроллер в Browser pane.

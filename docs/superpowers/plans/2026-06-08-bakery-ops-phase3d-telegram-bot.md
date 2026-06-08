# Bakery Ops — Phase 3d: Telegram Bot — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let bakery staff send a sheet photo to the Nikas Cafe Telegram bot (with a caption naming the point + type) and have it recognized and persisted via the existing pipeline, replying with a status + web review link.

**Architecture:** A stateless Next.js webhook (`/api/telegram`) verifies Telegram's secret-token header, checks a chat_id allowlist, parses the photo caption into point + sheet type, downloads the photo via the Telegram Bot API, and runs the already-tested `ingestSheetPhoto`. Pure parsing (update extraction, caption, allowlist) is TDD'd; the Telegram API client and webhook wiring are thin and verified by deploy + a synthetic POST. Retries are safe because ingest dedups by image hash.

**Tech Stack:** Next.js 16 route handler (`runtime='nodejs'`, `maxDuration=60`), Telegram Bot API (`TELEGRAM_BOT_TOKEN`, bot 8929679970 — the bakery's own bot, separate from Nikas's Claude-Code telegram plugin), Vitest. Reuses `ingestSheetPhoto`, `buildIngestDeps`, `loadCatalog`, `pointIdFromInput`, `pointName`.

**Spec:** Phase 1 design §7 (Telegram capture) + §11 (chat_id allowlist). The pipeline (recognition → persist) is unchanged.

---

## Decisions locked

- **Webhook security:** Telegram `setWebhook` is called with `secret_token`; Telegram then sends header `X-Telegram-Bot-Api-Secret-Token` on every update. The route rejects (401) if it ≠ `TELEGRAM_WEBHOOK_SECRET` env. (The route is already excluded from the auth middleware matcher — added in 3c.)
- **Allowlist:** `TELEGRAM_ALLOWED_CHAT_IDS` env = comma-separated chat ids. A non-allowlisted sender gets a reply with their own chat_id (so Nikas can bootstrap by adding it to the env). Empty/unset ⇒ nobody allowed (everyone is told their id).
- **Point + type via caption** (stateless, robust): the photo caption must name a point and a type, e.g. «Плюшкино пироги», «Корица десерты», «Плюшкино кондитерка». No caption / unparseable ⇒ a help reply, no ingest. (Inline-keyboard buttons would need cross-request state — deferred.)
- **Always 200** (except bad secret → 401) so Telegram doesn't hammer retries; a retry of the same photo dedups by `imageHash` anyway.
- **Review link** uses the request origin (`new URL(req.url).origin`) — no extra env.
- Photos are JPEG → `mediaType: 'image/jpeg'`. Largest photo size used.

---

## File Structure

**New — lib (unit-tested):**
- `src/lib/telegram/parse.ts` — pure: `extractMessage(update)`, `parseCaption(text)`, `parseAllowedChatIds(raw)`, `isAllowed(chatId, allowed)`.

**New — lib (thin IO, build-verified):**
- `src/lib/telegram/api.ts` — `sendMessage(chatId, text)`, `getFileBytes(fileId)` over the Telegram Bot API.

**New — app:**
- `src/app/api/telegram/route.ts` — the webhook (verify → allowlist → caption → download → ingest → reply).

**Ops (no code):** set `TELEGRAM_WEBHOOK_SECRET` (+ later `TELEGRAM_ALLOWED_CHAT_IDS`) in Vercel; register the webhook with `setWebhook`.

---

## Task 1: Pure Telegram parsing

**Files:**
- Create: `src/lib/telegram/parse.ts`
- Test: `src/lib/telegram/parse.test.ts`

- [ ] **Step 1: Write the failing test** — `src/lib/telegram/parse.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { extractMessage, parseCaption, parseAllowedChatIds, isAllowed } from './parse';

describe('extractMessage', () => {
  it('pulls chatId, caption text and the largest photo file_id', () => {
    const update = {
      update_id: 1,
      message: {
        chat: { id: 555 },
        caption: 'Плюшкино пироги',
        photo: [
          { file_id: 'small', width: 90 },
          { file_id: 'big', width: 1280 },
        ],
      },
    };
    expect(extractMessage(update)).toEqual({ chatId: 555, text: 'Плюшкино пироги', photoFileId: 'big' });
  });
  it('uses text when there is no caption, and null photo when none', () => {
    expect(extractMessage({ message: { chat: { id: 7 }, text: 'привет' } })).toEqual({ chatId: 7, text: 'привет', photoFileId: null });
  });
  it('returns null when there is no message', () => {
    expect(extractMessage({ update_id: 1 })).toBeNull();
    expect(extractMessage(null)).toBeNull();
  });
});

describe('parseCaption', () => {
  it('parses point + pies', () => {
    expect(parseCaption('Плюшкино пироги')).toEqual({ pointId: 'point-1', sheetType: 'pies' });
  });
  it('parses point + desserts (any order, case-insensitive)', () => {
    expect(parseCaption('десерты корица')).toEqual({ pointId: 'point-2', sheetType: 'desserts' });
  });
  it('parses freeform confectionery', () => {
    expect(parseCaption('Плюшкино кондитерка')).toEqual({ pointId: 'point-1', sheetType: 'confectionery_freeform' });
  });
  it('accepts point ids and "выпечка" synonym', () => {
    expect(parseCaption('point-2 выпечка')).toEqual({ pointId: 'point-2', sheetType: 'pies' });
  });
  it('returns null when point or type missing', () => {
    expect(parseCaption('просто пироги')).toBeNull();
    expect(parseCaption('Плюшкино')).toBeNull();
    expect(parseCaption('')).toBeNull();
  });
});

describe('allowlist', () => {
  it('parses comma/space separated ids, ignoring junk', () => {
    expect(parseAllowedChatIds('111, 222 , ,abc, 333')).toEqual([111, 222, 333]);
    expect(parseAllowedChatIds('')).toEqual([]);
  });
  it('isAllowed checks membership', () => {
    expect(isAllowed(222, [111, 222])).toBe(true);
    expect(isAllowed(999, [111, 222])).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/lib/telegram/parse.test.ts`
Expected: FAIL — cannot find module `./parse`.

- [ ] **Step 3: Write implementation** — `src/lib/telegram/parse.ts`:

```ts
import { pointIdFromInput, type PointId } from '@/lib/domain/points';
import type { SheetType } from '@/lib/domain/types';

export type TgMessage = { chatId: number; text: string; photoFileId: string | null };

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function extractMessage(update: any): TgMessage | null {
  const m = update?.message;
  if (!m || !m.chat || typeof m.chat.id !== 'number') return null;
  const text: string = m.caption ?? m.text ?? '';
  const photos = Array.isArray(m.photo) ? m.photo : [];
  const photoFileId = photos.length ? photos[photos.length - 1].file_id : null;
  return { chatId: m.chat.id, text, photoFileId };
}

export function parseCaption(text: string): { pointId: PointId; sheetType: SheetType } | null {
  const t = text.toLowerCase();

  let pointId: PointId | null = null;
  for (const token of t.split(/\s+/)) {
    const p = pointIdFromInput(token);
    if (p) { pointId = p; break; }
  }

  let sheetType: SheetType | null = null;
  if (/десерт/.test(t)) sheetType = 'desserts';
  else if (/кондитер|рукопис/.test(t)) sheetType = 'confectionery_freeform';
  else if (/пирог|выпечк/.test(t)) sheetType = 'pies';

  if (!pointId || !sheetType) return null;
  return { pointId, sheetType };
}

export function parseAllowedChatIds(raw: string): number[] {
  return raw
    .split(/[\s,]+/)
    .map((s) => s.trim())
    .filter((s) => /^\d+$/.test(s))
    .map(Number);
}

export function isAllowed(chatId: number, allowed: number[]): boolean {
  return allowed.includes(chatId);
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/lib/telegram/parse.test.ts`
Expected: PASS (10 tests). (`pointIdFromInput('корица')` → 'point-2'; for caption tokens, punctuation is whitespace-split; «корица» matches by name.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/telegram/parse.ts src/lib/telegram/parse.test.ts
git commit -m "feat(telegram): чистый парсинг апдейта/подписи/allowlist"
```

---

## Task 2: Telegram API client

**Files:**
- Create: `src/lib/telegram/api.ts`

Thin IO over the Bot API (`TELEGRAM_BOT_TOKEN`). No unit test (network); verified by the live webhook test in Task 4.

- [ ] **Step 1: Write the implementation** — `src/lib/telegram/api.ts`:

```ts
const apiUrl = (method: string) => `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/${method}`;

/** Отправить текст в чат. Ошибки логируем, но не роняем вебхук. */
export async function sendMessage(chatId: number, text: string): Promise<void> {
  try {
    await fetch(apiUrl('sendMessage'), {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
    });
  } catch (e) {
    console.error('telegram sendMessage failed', e);
  }
}

/** Скачать файл по file_id: getFile → file_path → бинарь. */
export async function getFileBytes(fileId: string): Promise<Uint8Array> {
  const res = await fetch(`${apiUrl('getFile')}?file_id=${encodeURIComponent(fileId)}`);
  const json = (await res.json()) as { ok: boolean; result?: { file_path?: string } };
  const filePath = json.result?.file_path;
  if (!filePath) throw new Error('Telegram getFile: нет file_path');
  const fileRes = await fetch(`https://api.telegram.org/file/bot${process.env.TELEGRAM_BOT_TOKEN}/${filePath}`);
  if (!fileRes.ok) throw new Error(`Telegram file download failed: ${fileRes.status}`);
  return new Uint8Array(await fileRes.arrayBuffer());
}
```

- [ ] **Step 2: Verify it type-checks**

Run: `npx tsc --noEmit && npx eslint src/lib/telegram/api.ts`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/lib/telegram/api.ts
git commit -m "feat(telegram): клиент Bot API (sendMessage, getFileBytes)"
```

---

## Task 3: Webhook route

**Files:**
- Create: `src/app/api/telegram/route.ts`

Wiring; verified by build + Task 4. The middleware matcher already excludes `api/telegram` (set in Phase 3c), so this route is NOT behind the web auth — it authenticates via the Telegram secret-token header.

- [ ] **Step 1: Write the route** — `src/app/api/telegram/route.ts`:

```ts
import { getPrisma } from '@/lib/db/client';
import { loadCatalog } from '@/lib/db/catalog-repo';
import { ingestSheetPhoto } from '@/lib/ingest/ingest-sheet';
import { buildIngestDeps } from '@/lib/ingest/deps';
import { pointName } from '@/lib/domain/points';
import { extractMessage, parseCaption, parseAllowedChatIds, isAllowed } from '@/lib/telegram/parse';
import { sendMessage, getFileBytes } from '@/lib/telegram/api';

export const runtime = 'nodejs';
export const maxDuration = 60;

const HELP =
  'Пришлите ФОТО листа с подписью: точка + тип.\n' +
  'Примеры: «Плюшкино пироги», «Корица десерты», «Плюшкино кондитерка».';

const SHEET_TYPE_RU: Record<string, string> = {
  pies: 'пироги',
  desserts: 'десерты',
  confectionery_freeform: 'кондитерка',
};

export async function POST(req: Request) {
  if (req.headers.get('x-telegram-bot-api-secret-token') !== process.env.TELEGRAM_WEBHOOK_SECRET) {
    return new Response('forbidden', { status: 401 });
  }

  const update = await req.json().catch(() => null);
  const msg = extractMessage(update);
  if (!msg) return Response.json({ ok: true });

  const allowed = parseAllowedChatIds(process.env.TELEGRAM_ALLOWED_CHAT_IDS ?? '');
  if (!isAllowed(msg.chatId, allowed)) {
    await sendMessage(msg.chatId, `Доступ закрыт. Передайте администратору ваш chat_id: ${msg.chatId}`);
    return Response.json({ ok: true });
  }

  if (!msg.photoFileId) {
    await sendMessage(msg.chatId, HELP);
    return Response.json({ ok: true });
  }

  const parsed = parseCaption(msg.text);
  if (!parsed) {
    await sendMessage(msg.chatId, `Не понял точку и тип листа.\n${HELP}`);
    return Response.json({ ok: true });
  }

  try {
    const bytes = await getFileBytes(msg.photoFileId);
    const catalog = await loadCatalog(getPrisma(), parsed.sheetType, parsed.pointId);
    const result = await ingestSheetPhoto(
      {
        bytes,
        mediaType: 'image/jpeg',
        pointId: parsed.pointId,
        sheetType: parsed.sheetType,
        source: 'telegram',
        uploadedBy: `tg:${msg.chatId}`,
        catalog,
      },
      buildIngestDeps(),
    );
    const origin = new URL(req.url).origin;
    const statusText =
      result.status === 'duplicate'
        ? 'этот лист уже был загружен'
        : result.status === 'needs_review'
          ? 'распознан, нужна проверка'
          : 'распознан';
    await sendMessage(
      msg.chatId,
      `Лист принят: ${pointName(parsed.pointId)} · ${SHEET_TYPE_RU[parsed.sheetType]} — ${statusText}.\nПроверить: ${origin}/sheets/${result.sheetId}`,
    );
  } catch (e) {
    console.error('telegram ingest failed', e);
    await sendMessage(msg.chatId, 'Не удалось распознать лист. Попробуйте ещё раз или загрузите через сайт.');
  }

  return Response.json({ ok: true });
}
```

- [ ] **Step 2: Verify**

Run: `npx tsc --noEmit && npx eslint src/app/api/telegram/route.ts && npm run build 2>&1 | grep -E '/api/telegram|error|Error' | head`
Expected: clean; `/api/telegram` appears as a `ƒ` route.

- [ ] **Step 3: Commit**

```bash
git add src/app/api/telegram/route.ts
git commit -m "feat(api): Telegram-вебхук — фото листа → распознавание → ответ со ссылкой"
```

---

## Task 4: Verify, env, deploy, register webhook

**Files:** none (verification + ops)

- [ ] **Step 1: Full CI**

Run: `npx tsc --noEmit && npx eslint src && npm test 2>&1 | grep -E 'Tests|Test Files'`
Expected: tsc clean; eslint clean; tests pass (prior 112 + parse(10) = ~122 passed | 2 skipped).

- [ ] **Step 2: Set the webhook secret in Vercel** (Production + Development)

```bash
SECRET=$(openssl rand -hex 16)
printf '%s' "$SECRET" | npx vercel env add TELEGRAM_WEBHOOK_SECRET production
printf '%s' "$SECRET" | npx vercel env add TELEGRAM_WEBHOOK_SECRET development
echo "WEBHOOK SECRET = $SECRET"   # keep for the setWebhook call below
```
(`TELEGRAM_ALLOWED_CHAT_IDS` is intentionally left UNSET for now — the bot will reply with each sender's chat_id so Nikas can add the real ids and set the env later. Document this.)

- [ ] **Step 3: Deploy to production**

Run: `npx vercel deploy --prod --yes`
Expected: READY, aliased to https://bakery-ops-two.vercel.app.

- [ ] **Step 4: Register the webhook with Telegram**

```bash
set -a; . ./.env; set +a   # for TELEGRAM_BOT_TOKEN
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/setWebhook" \
  -d "url=https://bakery-ops-two.vercel.app/api/telegram" \
  -d "secret_token=${SECRET}"   # the SECRET printed in Step 2
echo
curl -sS "https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getWebhookInfo"
```
Expected: setWebhook → `{"ok":true,"result":true,"description":"Webhook was set"}`; getWebhookInfo shows the url + `pending_update_count`.

- [ ] **Step 5: Smoke-test the endpoint (auth gate)**

```bash
# Wrong secret → 401
curl -sS -o /dev/null -w "no-secret=%{http_code}\n" -X POST https://bakery-ops-two.vercel.app/api/telegram -H 'content-type: application/json' -d '{"message":{"chat":{"id":1},"text":"hi"}}'
# Correct secret, non-allowlisted text message → 200 (bot replies with chat_id to that chat; here chat 1 is fake so the reply just no-ops at Telegram)
curl -sS -o /dev/null -w "with-secret=%{http_code}\n" -X POST https://bakery-ops-two.vercel.app/api/telegram -H 'content-type: application/json' -H "x-telegram-bot-api-secret-token: ${SECRET}" -d '{"message":{"chat":{"id":1},"text":"hi"}}'
```
Expected: `no-secret=401`, `with-secret=200`.

- [ ] **Step 6: Real test (Nikas)**

Tell Nikas to message the bakery bot: send a sheet PHOTO with caption «Плюшкино пироги». First message (not allowlisted) → bot replies with his chat_id. Add that id: `printf '%s' "<chatId>" | npx vercel env add TELEGRAM_ALLOWED_CHAT_IDS production` (+ development), redeploy, then resend the photo → bot recognizes + replies with the review link.

- [ ] **Step 7: Update project memory + push**

Edit `/Users/nkola/.claude/projects/-Users-nkola/memory/project_bakery_ops.md`: record Phase 3d done (Telegram webhook over ingestSheetPhoto, caption «точка тип», secret-token header, chat_id allowlist self-bootstrap, webhook registered). Note `TELEGRAM_ALLOWED_CHAT_IDS` bootstrap step is on Nikas. Then `git push`.

---

## Self-Review

**Spec coverage (Phase 1 §7 Telegram, §11 allowlist):**
- §7 Telegram capture (photo → point/type → blob → sheet) → Tasks 1–3 over `ingestSheetPhoto`. "Бот спрашивает/угадывает точку и тип" → caption parse + help reply on missing (the "asks" path). §7 confirmation → reply links to the web review page (`/sheets/[id]`). §11 chat_id allowlist → Tasks 1/3 + env. Secrets in env (§11) → Task 4.
- Recognition/persist unchanged (reuses tested pipeline). Dedup-on-retry via existing `imageHash`.

**Placeholder scan:** none. `TELEGRAM_ALLOWED_CHAT_IDS` unset-at-first is an explicit, documented bootstrap (bot reveals chat_id), not a gap. Real-photo e2e is Nikas's step (can't fabricate a Telegram-hosted file_id) — the synthetic POST verifies the secret gate + 200 path.

**Type consistency:** `extractMessage`/`parseCaption`/`parseAllowedChatIds`/`isAllowed` (Task 1) consumed by the route (Task 3). `parseCaption` returns `{ pointId: PointId; sheetType: SheetType }` matching `ingestSheetPhoto`'s `IngestInput` (pointId string, sheetType SheetType, source 'telegram', mediaType 'image/jpeg'). `pointName` (points.ts), `loadCatalog(prisma, sheetType, pointId)`, `buildIngestDeps()` used with real signatures. `getFileBytes` returns `Uint8Array` (matches IngestInput.bytes).

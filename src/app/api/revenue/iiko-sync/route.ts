import { requireOwner } from '@/lib/auth/require-owner';
import { getPrisma } from '@/lib/db/client';
import { iikoCatchUpWindow, runIikoSync } from '@/lib/iiko/sync';

export const runtime = 'nodejs';
export const maxDuration = 60;

/** Один запрос OLAP — не больше 31 дня; длинную историю грузит CLI `npm run import:iiko`. */
const MAX_DAYS = 31;

const isIsoDate = (s: unknown): s is string =>
  typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && new Date(`${s}T00:00:00.000Z`).toISOString().slice(0, 10) === s;

/** Выручка Плюшкино из iiko сейчас. Без тела — вчера и сегодня (после сбоя — с последнего загруженного дня); с телом { from, till } — свой период. */
export async function POST(req: Request) {
  const session = await requireOwner();
  if (session instanceof Response) return session;

  const body = (await req.json().catch(() => null)) as { from?: unknown; till?: unknown } | null;
  let range: { from: string; till: string } | null = null;
  if (body && (body.from !== undefined || body.till !== undefined)) {
    const { from, till } = body;
    if (!isIsoDate(from) || !isIsoDate(till)) return Response.json({ error: 'Неверная дата' }, { status: 400 });
    const days = (Date.parse(till) - Date.parse(from)) / 86_400_000 + 1;
    if (days < 1) return Response.json({ error: 'Дата «по» раньше «с»' }, { status: 400 });
    if (days > MAX_DAYS) return Response.json({ error: `Период больше ${MAX_DAYS} дней — загрузите частями` }, { status: 400 });
    range = { from, till };
  }

  try {
    range ??= await iikoCatchUpWindow(getPrisma(), new Date());
    return Response.json(await runIikoSync(getPrisma(), range));
  } catch (e) {
    const error = e instanceof Error ? e.message : String(e);
    console.error('iiko-sync failed:', error);
    return Response.json({ error, ...range }, { status: 502 });
  }
}

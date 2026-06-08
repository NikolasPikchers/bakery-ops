import { getPrisma } from '@/lib/db/client';
import { loadCatalogForPoint } from '@/lib/db/catalog-repo';
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
    // Полный каталог точки (оба типа) — лист может смешивать пироги и кондитерку/десерты.
    const catalog = await loadCatalogForPoint(getPrisma(), parsed.pointId);
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

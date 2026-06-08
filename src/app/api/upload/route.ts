import { auth } from '@/auth';
import { getPrisma } from '@/lib/db/client';
import { loadCatalogForPoint } from '@/lib/db/catalog-repo';
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
  // Полный каталог точки (оба типа) — лист может смешивать пироги и кондитерку/десерты.
  const catalog = await loadCatalogForPoint(getPrisma(), parsed.value.pointId);

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

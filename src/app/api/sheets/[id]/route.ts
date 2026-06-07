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

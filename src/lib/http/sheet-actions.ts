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

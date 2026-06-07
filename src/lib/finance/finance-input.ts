import { z } from 'zod';
import { EXPENSE_CATEGORY_KEYS } from './categories';

const POINT_IDS = ['point-1', 'point-2'] as const;

const baseShape = {
  pointId: z.enum(POINT_IDS),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  amount: z.number().positive(),
  note: z.string().optional(),
};

const schema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('revenue'), ...baseShape }),
  z.object({ type: z.literal('expense'), ...baseShape, category: z.enum(EXPENSE_CATEGORY_KEYS) }),
]);

export type FinanceEntry = z.infer<typeof schema>;
export type ParseResult = { ok: true; value: FinanceEntry } | { ok: false; error: string };

export function parseFinanceEntry(body: unknown): ParseResult {
  const r = schema.safeParse(body);
  return r.success ? { ok: true, value: r.data } : { ok: false, error: r.error.message };
}

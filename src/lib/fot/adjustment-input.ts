import { z } from 'zod';
import { parseAdjustmentAmount } from './adjustments';

const amount = z.union([z.string(), z.number().finite()])
  .transform((value) => parseAdjustmentAmount(String(value)))
  .refine((value) => value !== null, 'Введите сумму со знаком, например +200 или -100. До двух знаков после запятой.')
  .transform((value) => value as number);
const month = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);
const date = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00.000Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, 'Такой даты нет в календаре');
const common = { employeeId: z.string().trim().min(1).max(100), amount, note: z.string().trim().max(300).default('') };

export const payrollAdjustmentSchema = z.discriminatedUnion('kind', [
  z.object({ ...common, kind: z.literal('day'), date, present: z.boolean().optional() }),
  z.object({ ...common, kind: z.literal('payment'), month, half: z.union([z.literal(1), z.literal(2)]) }),
]);

export type PayrollAdjustmentInput = z.output<typeof payrollAdjustmentSchema>;

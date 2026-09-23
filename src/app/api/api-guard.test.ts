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

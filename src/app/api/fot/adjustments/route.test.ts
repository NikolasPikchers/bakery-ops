import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { auth } from '@/auth';
import { setPayrollAdjustment } from '@/lib/db/fot-repo';

const { prisma } = vi.hoisted(() => ({ prisma: { employee: { findFirst: vi.fn() } } }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getPrisma: () => prisma }));
vi.mock('@/lib/db/fot-repo', () => ({ setPayrollAdjustment: vi.fn() }));

const req = (body: unknown) => new Request('http://localhost/api/fot/adjustments', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
const day = { kind: 'day', employeeId: 'e', date: '2026-09-15', amount: '+200', note: 'Подмена' };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ role: 'owner', user: { name: 'Владелец' }, expires: '' } as never);
  prisma.employee.findFirst.mockResolvedValue({ id: 'e' });
});

describe('POST /api/fot/adjustments', () => {
  it('сохраняет доплату за день и явно изменённую отметку выхода', async () => {
    expect((await POST(req({ ...day, present: false }))).status).toBe(200);
    expect(setPayrollAdjustment).toHaveBeenCalledWith(prisma, { ...day, amount: 200, present: false });
  });

  it('принимает удержание с копейками и поправку второй выплаты', async () => {
    expect((await POST(req({ kind: 'payment', employeeId: 'e', month: '2026-09', half: 2, amount: '-200,50', note: ' Аванс ' }))).status).toBe(200);
    expect(setPayrollAdjustment).toHaveBeenCalledWith(prisma, { kind: 'payment', employeeId: 'e', month: '2026-09', half: 2, amount: -200.5, note: 'Аванс' });
  });

  it('ноль сбрасывает корректировку', async () => {
    expect((await POST(req({ ...day, amount: '0' }))).status).toBe(200);
    expect(setPayrollAdjustment).toHaveBeenCalledWith(prisma, expect.objectContaining({ amount: 0 }));
  });

  it.each([
    null,
    { ...day, date: '2026-02-30' },
    { ...day, date: '2026-13-01' },
    { ...day, amount: '' },
    { ...day, amount: '1e3' },
    { ...day, amount: '200.001' },
    { ...day, amount: '100000000' },
    { ...day, employeeId: '' },
    { ...day, present: 'false' },
    { ...day, note: 'x'.repeat(301) },
    { kind: 'payment', employeeId: 'e', month: '2026-13', half: 1, amount: 200 },
    { kind: 'payment', employeeId: 'e', month: '2026-09', half: 3, amount: 200 },
  ])('не пишет в БД при неверных данных: %j', async (body) => {
    expect((await POST(req(body))).status).toBe(400);
    expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    expect(setPayrollAdjustment).not.toHaveBeenCalled();
  });

  it('не пишет для отсутствующего сотрудника', async () => {
    prisma.employee.findFirst.mockResolvedValue(null);
    expect((await POST(req(day))).status).toBe(404);
    expect(setPayrollAdjustment).not.toHaveBeenCalled();
  });

  it.each([null, { role: 'staff', user: { name: 'Сотрудник' }, expires: '' }])('доступен только владельцу', async (session) => {
    vi.mocked(auth).mockResolvedValue(session as never);
    const response = await POST(req(day));
    expect(response.status).toBe(session ? 403 : 401);
    expect(prisma.employee.findFirst).not.toHaveBeenCalled();
    expect(setPayrollAdjustment).not.toHaveBeenCalled();
  });

  it('ошибка сохранения возвращается клиенту без внутренних подробностей', async () => {
    vi.mocked(setPayrollAdjustment).mockRejectedValueOnce(new Error('private connection details'));
    const response = await POST(req(day));
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private');
  });
});

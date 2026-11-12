import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Prisma } from '@prisma/client';
import { PATCH } from './route';
import { auth } from '@/auth';

const { prisma } = vi.hoisted(() => ({ prisma: { employee: { update: vi.fn() } } }));
vi.mock('@/auth', () => ({ auth: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getPrisma: () => prisma }));

const params = { params: Promise.resolve({ id: 'employee-1' }) };
const request = (body: unknown) => new Request('http://localhost/api/fot/employees/employee-1', {
  method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(auth).mockResolvedValue({ role: 'owner', user: { name: 'Владелец' }, expires: '' } as never);
  prisma.employee.update.mockResolvedValue({ id: 'employee-1', name: 'Екатерина Иванова' });
});

describe('PATCH /api/fot/employees/[id]', () => {
  it('меняет только имя существующего сотрудника по ID, нормализует пробелы', async () => {
    const response = await PATCH(request({ name: '  Екатерина   Иванова  ' }), params);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ employee: { id: 'employee-1', name: 'Екатерина Иванова' } });
    expect(prisma.employee.update).toHaveBeenCalledWith({
      where: { id: 'employee-1', active: true }, data: { name: 'Екатерина Иванова' }, select: { id: true, name: true },
    });
  });

  it.each([null, {}, { name: '' }, { name: ' \t ' }, { name: 123 }, { name: 'Я'.repeat(101) }, { name: 'Катя\u0000' }, { name: 'Катя', basePay: 1 }])('не сохраняет неверные данные %j', async (body) => {
    expect((await PATCH(request(body), params)).status).toBe(400);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('показывает понятную ошибку при совпадении имён в одной группе', async () => {
    prisma.employee.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('unique constraint', { code: 'P2002', clientVersion: '7.8.0' }));
    const response = await PATCH(request({ name: 'Катя' }), params);
    expect(response.status).toBe(409);
    expect((await response.json()).error).toContain('именем');
  });

  it('возвращает 404 для отсутствующего или неактивного сотрудника', async () => {
    prisma.employee.update.mockRejectedValue(new Prisma.PrismaClientKnownRequestError('not found', { code: 'P2025', clientVersion: '7.8.0' }));
    expect((await PATCH(request({ name: 'Катя' }), params)).status).toBe(404);
  });

  it.each([null, { role: 'staff', user: { name: 'Сотрудник' }, expires: '' }])('доступен только владельцу', async (session) => {
    vi.mocked(auth).mockResolvedValue(session as never);
    expect((await PATCH(request({ name: 'Катя' }), params)).status).toBe(session ? 403 : 401);
    expect(prisma.employee.update).not.toHaveBeenCalled();
  });

  it('не выдаёт внутренние подробности ошибки БД', async () => {
    prisma.employee.update.mockRejectedValue(new Error('private database details'));
    const response = await PATCH(request({ name: 'Катя' }), params);
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain('private');
  });
});

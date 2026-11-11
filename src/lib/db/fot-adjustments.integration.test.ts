import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { loadFot, setAttendance, setPayrollAdjustment } from './fot-repo';

// Только явно заданная тестовая БД: обычный npm test не пишет в рабочую базу.
const url = process.env.FOT_TEST_DATABASE_URL;

describe.skipIf(!url)('корректировки ФОТ — сохранение и повторная загрузка из PostgreSQL', () => {
  let prisma: PrismaClient;
  const employeeId = `fot-adjustment-test-${Date.now()}`;
  const day = { kind: 'day' as const, employeeId, date: '2026-09-15', amount: 200, note: 'Подмена' };
  const payment = { kind: 'payment' as const, employeeId, month: '2026-09', half: 1 as const, amount: -100.5, note: 'Ранее выдано' };

  beforeAll(async () => {
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
    await prisma.employee.create({ data: { id: employeeId, name: employeeId, group: 'bakery', role: 'baker', brigade: 'A', basePay: 2300 } });
  });

  afterAll(async () => {
    await prisma.payrollDayAdjustment.deleteMany({ where: { employeeId } });
    await prisma.payrollPaymentAdjustment.deleteMany({ where: { employeeId } });
    await prisma.attendance.deleteMany({ where: { employeeId } });
    await prisma.employee.deleteMany({ where: { id: employeeId } });
    await prisma.$disconnect();
  });

  const row = async (month = '2026-09') => (await loadFot(prisma, month)).bakery.find((r) => r.employee.id === employeeId)!;

  it('повторное сохранение не удваивает суммы; смена и доплата сохраняются независимо', async () => {
    const original = await row();
    await setPayrollAdjustment(prisma, { ...day, present: true });
    await setPayrollAdjustment(prisma, day);
    await setPayrollAdjustment(prisma, payment);
    await setPayrollAdjustment(prisma, payment);
    expect(await prisma.payrollDayAdjustment.count({ where: { employeeId } })).toBe(1);
    expect(await prisma.payrollPaymentAdjustment.count({ where: { employeeId } })).toBe(1);
    const saved = await row();
    expect(saved.paymentsTotal).toBe(original.paymentsTotal + 99.5);
    expect(saved.payments[0]).toMatchObject({ dayAdjustment: 200, adjustment: -100.5, adjustmentNote: 'Ранее выдано' });
    expect(saved.days[14]).toMatchObject({ present: true, adjustment: 200, adjustmentNote: 'Подмена' });
    await setAttendance(prisma, employeeId, day.date, false);
    expect((await row()).days[14]).toMatchObject({ present: false, pay: 200, adjustment: 200 });
    // В другом месяце не должно быть ни дневной, ни платёжной поправки сентября.
    const october = await row('2026-10');
    expect(october.days.every((d) => d.adjustment === 0)).toBe(true);
    expect(october.payments.every((p) => p.adjustment === 0 && p.dayAdjustment === 0)).toBe(true);
    await setPayrollAdjustment(prisma, { ...day, amount: 0, present: true });
    await setPayrollAdjustment(prisma, { ...payment, amount: 0 });
    expect(await prisma.payrollDayAdjustment.count({ where: { employeeId } })).toBe(0);
    expect(await prisma.payrollPaymentAdjustment.count({ where: { employeeId } })).toBe(0);
    expect((await row()).paymentsTotal).toBe(original.paymentsTotal);
  });
});

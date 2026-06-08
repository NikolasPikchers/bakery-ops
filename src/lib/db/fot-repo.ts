import type { PrismaClient } from '@prisma/client';
import { monthRange, monthDays as monthDaysOf } from '@/lib/finance/month';
import { toDbDate } from './dates';
import { autoPresent, type SchedEmployee } from '@/lib/fot/schedule';
import { dailyPay } from '@/lib/fot/payroll';

export type FotEmployee = {
  id: string;
  name: string;
  group: 'bakery' | 'confectionery';
  role: 'baker' | 'cashier' | 'kitchen' | 'confectioner';
  brigade: string | null;
  basePay: number;
  schedOffset: number;
};
export type FotDay = { date: string; present: boolean; pay: number };
export type FotRow = { employee: FotEmployee; days: FotDay[]; shifts: number; payTotal: number; payTo15: number; payAfter15: number };
export type FotView = {
  month: string;
  monthDays: string[];
  bakery: FotRow[];
  confectionery: FotRow[];
  dailyTotal: { date: string; amount: number }[];
  totals: { bakeryTo15: number; bakeryAfter15: number; bakeryTotal: number; confectioneryTotal: number; grand: number };
};

/** Чистая сборка табеля из данных (без БД). */
export function buildFot(args: {
  month: string;
  monthDays: string[];
  employees: FotEmployee[];
  revenueByDate: Map<string, { total: number; pies: number }>;
  overrides: Map<string, boolean>;
}): FotView {
  const { month, monthDays, employees, revenueByDate, overrides } = args;
  const rows: FotRow[] = employees.map((e) => {
    const sched: SchedEmployee = { role: e.role, group: e.group, brigade: e.brigade, schedOffset: e.schedOffset };
    let payTotal = 0;
    let payTo15 = 0;
    let payAfter15 = 0;
    let shifts = 0;
    const days: FotDay[] = monthDays.map((date) => {
      const ov = overrides.get(`${e.id}|${date}`);
      const present = ov ?? autoPresent(sched, date);
      const pay = present ? dailyPay({ role: e.role, basePay: e.basePay }, revenueByDate.get(date) ?? { total: 0, pies: 0 }) : 0;
      if (present) {
        shifts++;
        payTotal += pay;
        if (Number(date.slice(8, 10)) <= 15) payTo15 += pay;
        else payAfter15 += pay;
      }
      return { date, present, pay };
    });
    return { employee: e, days, shifts, payTotal, payTo15, payAfter15 };
  });
  const bakery = rows.filter((r) => r.employee.group === 'bakery');
  const confectionery = rows.filter((r) => r.employee.group === 'confectionery');
  const dailyTotal = monthDays.map((date, i) => ({ date, amount: rows.reduce((s, r) => s + r.days[i].pay, 0) }));
  const sumBy = (rs: FotRow[], k: (r: FotRow) => number) => rs.reduce((s, r) => s + k(r), 0);
  const totals = {
    bakeryTo15: sumBy(bakery, (r) => r.payTo15),
    bakeryAfter15: sumBy(bakery, (r) => r.payAfter15),
    bakeryTotal: sumBy(bakery, (r) => r.payTotal),
    confectioneryTotal: sumBy(confectionery, (r) => r.payTotal),
    grand: sumBy(rows, (r) => r.payTotal),
  };
  return { month, monthDays, bakery, confectionery, dailyTotal, totals };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function fetchInputs(prisma: PrismaClient, month: string) {
  const { start, end } = monthRange(month);
  const startD = new Date(`${start}T00:00:00.000Z`);
  const endD = new Date(`${end}T00:00:00.000Z`);
  const [emps, revs, atts] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: [{ group: 'asc' }, { name: 'asc' }] }),
    prisma.revenue.findMany({ where: { pointId: 'point-1', date: { gte: startD, lt: endD } }, select: { date: true, amount: true, confectionery: true } }),
    prisma.attendance.findMany({ where: { date: { gte: startD, lt: endD } }, select: { employeeId: true, date: true, present: true } }),
  ]);
  const employees: FotEmployee[] = emps.map((e) => ({
    id: e.id,
    name: e.name,
    group: e.group as FotEmployee['group'],
    role: e.role as FotEmployee['role'],
    brigade: e.brigade,
    basePay: Number(e.basePay),
    schedOffset: e.schedOffset,
  }));
  const revenueByDate = new Map<string, { total: number; pies: number }>();
  for (const r of revs) {
    const total = Number(r.amount);
    revenueByDate.set(iso(r.date), { total, pies: total - (r.confectionery == null ? 0 : Number(r.confectionery)) });
  }
  const overrides = new Map<string, boolean>();
  for (const a of atts) overrides.set(`${a.employeeId}|${iso(a.date)}`, a.present);
  return { employees, revenueByDate, overrides };
}

export async function loadFot(prisma: PrismaClient, month: string): Promise<FotView> {
  const { employees, revenueByDate, overrides } = await fetchInputs(prisma, month);
  return buildFot({ month, monthDays: monthDaysOf(month), employees, revenueByDate, overrides });
}

/** Сумма ФОТ за месяц (для дашборда). */
export async function computePayrollTotal(prisma: PrismaClient, month: string): Promise<number> {
  return (await loadFot(prisma, month)).totals.grand;
}

/** Ручная отметка выхода (override поверх авто-графика). */
export async function setAttendance(prisma: PrismaClient, employeeId: string, date: string, present: boolean) {
  const d = toDbDate(date);
  return prisma.attendance.upsert({
    where: { employeeId_date: { employeeId, date: d } },
    create: { employeeId, date: d, present },
    update: { present },
  });
}

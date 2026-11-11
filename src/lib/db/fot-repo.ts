import type { PrismaClient } from '@prisma/client';
import { monthRange, monthDays as monthDaysOf, prevMonth } from '@/lib/finance/month';
import { toDbDate } from './dates';
import { autoPresent, type SchedEmployee } from '@/lib/fot/schedule';
import { dailyPay } from '@/lib/fot/payroll';
import { actualShifts, payPeriods, payPeriodAmounts } from '@/lib/fot/pay-periods';
import { FIXED_SALARIES, type FixedSalary } from '@/lib/fot/fixed';
import type { PayrollAdjustmentInput } from '@/lib/fot/adjustment-input';

export type FotEmployee = {
  id: string;
  name: string;
  group: 'bakery' | 'confectionery';
  role: 'baker' | 'cashier' | 'kitchen' | 'confectioner';
  brigade: string | null;
  basePay: number;
  schedOffset: number;
};
export type FotAdjustment = { amount: number; note: string | null };
export type FotDay = { date: string; present: boolean; base: number; bonus: number; adjustment: number; adjustmentNote: string | null; pay: number };
/** Одна из двух выплат месяца: сколько, когда и из чего. `bonusDates` — чьи премии в неё вошли. */
export type FotPayment = { half: 1 | 2; payDate: string; shifts: number; base: number; bonus: number; dayAdjustment: number; adjustment: number; adjustmentNote: string | null; amount: number; bonusDates: string[] };
export type FotRow = {
  employee: FotEmployee;
  days: FotDay[];
  shifts: number;
  /** Начисление за дни месяца + ручные поправки выплат на их даты — для дашборда. */
  payTotal: number;
  /** Две выплаты месяца (см. `@/lib/fot/pay-periods`). */
  payments: FotPayment[];
  /** Сумма к выдаче за месяц = сумма выплат. Отличается от `payTotal` переносом премий. */
  paymentsTotal: number;
};
export type FotFixedRow = { name: string; monthly: number; total: number };
export type FotView = {
  month: string;
  monthDays: string[];
  bakery: FotRow[];
  confectionery: FotRow[];
  fixed: FotFixedRow[];
  dailyTotal: { date: string; amount: number }[];
  /** Даты с внесённой выручкой Плюшкино (прошлый и текущий месяц) — для «ждёт выручку» и «предварительно». */
  revenueDates: string[];
  totals: {
    /** Суммы 1-й и 2-й выплат пекарни (даты выплат у бригад разные). */
    bakeryPay1: number;
    bakeryPay2: number;
    bakeryTotal: number;
    confectioneryTotal: number;
    fixedTotal: number;
    /** Начисление за месяц + фикс — расход ФОТ для дашборда (по дням смен). */
    grand: number;
    /** К выдаче за месяц + фикс — то, что показывает страница /fot. */
    paymentsGrand: number;
  };
};

/** Чистая сборка табеля из данных (без БД). `fixedSalaries` — фикс-оклады (по умолчанию пусто). */
export function buildFot(args: {
  month: string;
  monthDays: string[];
  employees: FotEmployee[];
  revenueByDate: Map<string, { total: number; pies: number }>;
  overrides: Map<string, boolean>;
  dayAdjustments?: ReadonlyMap<string, FotAdjustment>;
  paymentAdjustments?: ReadonlyMap<string, FotAdjustment>;
  fixedSalaries?: FixedSalary[];
}): FotView {
  const { month, monthDays, employees, revenueByDate, overrides, dayAdjustments = new Map(), paymentAdjustments = new Map(), fixedSalaries = [] } = args;
  const fullMonthDays = monthDaysOf(month);
  // Периоды выплат считаются за полный месяц (даже если `monthDays` обрезаны «по сегодня»)
  // и захватывают хвост прошлого месяца: в первую выплату входит премия за последнюю
  // смену прошлого месяца, а её дата и выручка лежат до 1-го числа.
  const periodDays = [...monthDaysOf(prevMonth(month)), ...fullMonthDays];
  const rows: FotRow[] = employees.map((e) => {
    const sched: SchedEmployee = { role: e.role, group: e.group, brigade: e.brigade, schedOffset: e.schedOffset };
    const payEmp = { role: e.role, basePay: e.basePay };
    let payTotal = 0;
    let shifts = 0;
    const days: FotDay[] = monthDays.map((date) => {
      const ov = overrides.get(`${e.id}|${date}`);
      const present = ov ?? autoPresent(sched, date);
      // Сохраняем расчёт ставки и премии и на выходной: редактор может включить смену.
      const base = e.basePay;
      const bonus = dailyPay(payEmp, revenueByDate.get(date) ?? { total: 0, pies: 0 }) - base;
      const adj = dayAdjustments.get(`${e.id}|${date}`);
      const adjustment = adj?.amount ?? 0;
      const pay = Math.round(((present ? base + bonus : 0) + adjustment) * 100) / 100;
      if (present) shifts++;
      payTotal += pay;
      return { date, present, base, bonus, adjustment, adjustmentNote: adj?.note ?? null, pay };
    });
    const empShifts = actualShifts(sched, periodDays, (d) => overrides.get(`${e.id}|${d}`));
    const calculated = payPeriodAmounts(payEmp, payPeriods(month, empShifts), revenueByDate);
    const payments: FotPayment[] = ([1, 2] as const).flatMap((half) => {
      const p = calculated.find((p) => p.half === half);
      // Доплаты за день входят в свою календарную половину без переноса премий.
      // Учитываются и выходные дни, даже если в периоде вообще нет смен.
      const dayAdjustment = Math.round(fullMonthDays
        .filter((date) => (Number(date.slice(8, 10)) <= 15 ? 1 : 2) === half)
        .reduce((sum, date) => sum + (dayAdjustments.get(`${e.id}|${date}`)?.amount ?? 0), 0) * 100) / 100;
      const adj = paymentAdjustments.get(`${e.id}|${half}`);
      const adjustment = adj?.amount ?? 0;
      if (!p && dayAdjustment === 0 && adjustment === 0) return [];
      const payDate = p?.payDate ?? (half === 1 ? `${month}-15` : fullMonthDays[fullMonthDays.length - 1]);
      // Прямая поправка выплаты — расход в дату выплаты, только на учитываемом диапазоне.
      if (monthDays.includes(payDate)) payTotal += adjustment;
      return [{
        half,
        payDate,
        shifts: p?.shiftDates.length ?? 0,
        base: p?.base ?? 0,
        bonus: p?.bonus ?? 0,
        dayAdjustment,
        adjustment,
        adjustmentNote: adj?.note ?? null,
        amount: Math.round(((p?.amount ?? 0) + dayAdjustment + adjustment) * 100) / 100,
        bonusDates: p?.bonusDates ?? [],
      }];
    });
    const paymentsTotal = payments.reduce((s, p) => s + p.amount, 0);
    return { employee: e, days, shifts, payTotal, payments, paymentsTotal };
  });
  // Пекарня: группируем по бригадам (A, затем B), кухня — вниз; внутри: пекари → кассир.
  const brigRank = (r: FotRow) => (r.employee.role === 'kitchen' ? 3 : r.employee.brigade === 'A' ? 0 : r.employee.brigade === 'B' ? 1 : 2);
  const roleRank = (r: FotRow) => (r.employee.role === 'baker' ? 0 : r.employee.role === 'cashier' ? 1 : 2);
  const bakery = rows
    .filter((r) => r.employee.group === 'bakery')
    .sort((a, b) => brigRank(a) - brigRank(b) || roleRank(a) - roleRank(b) || a.employee.name.localeCompare(b.employee.name));
  const confectionery = rows.filter((r) => r.employee.group === 'confectionery');

  // Фикс-оклады (напр. папа-водитель): начисляются пропорционально числу учитываемых
  // дней месяца. Полный месяц (monthDays = весь месяц) → ровно monthly; на дашборде
  // (monthDays обрезаны «по сегодня») → пропорция дней.
  const fullDays = monthDaysOf(month).length;
  const fixed: FotFixedRow[] = fixedSalaries.map((f) => ({
    name: f.name,
    monthly: f.monthly,
    total: fullDays > 0 ? Math.round((f.monthly * monthDays.length) / fullDays) : 0,
  }));
  const fixedTotal = fixed.reduce((s, f) => s + f.total, 0);

  // ФОТ за день = ЗП сотрудников за день + равномерная доля фикс-окладов (для графиков).
  // Сумма по дням == totals.grand (на учитываемом диапазоне дней).
  const fixedPerDay = fullDays > 0 ? fixedSalaries.reduce((s, f) => s + f.monthly, 0) / fullDays : 0;
  const dailyTotal = monthDays.map((date, i) => ({ date, amount: rows.reduce((s, r) => s + r.days[i].pay + r.payments.filter((p) => p.payDate === date).reduce((sum, p) => sum + p.adjustment, 0), 0) + fixedPerDay }));
  const sumBy = (rs: FotRow[], k: (r: FotRow) => number) => rs.reduce((s, r) => s + k(r), 0);
  const halfSum = (rs: FotRow[], half: 1 | 2) => sumBy(rs, (r) => r.payments.find((p) => p.half === half)?.amount ?? 0);
  const totals = {
    bakeryPay1: halfSum(bakery, 1),
    bakeryPay2: halfSum(bakery, 2),
    bakeryTotal: sumBy(bakery, (r) => r.paymentsTotal),
    confectioneryTotal: sumBy(confectionery, (r) => r.paymentsTotal),
    fixedTotal,
    grand: sumBy(rows, (r) => r.payTotal) + fixedTotal,
    paymentsGrand: sumBy(rows, (r) => r.paymentsTotal) + fixedTotal,
  };
  return { month, monthDays, bakery, confectionery, fixed, dailyTotal, revenueDates: [...revenueByDate.keys()].sort(), totals };
}

const iso = (d: Date) => d.toISOString().slice(0, 10);

async function fetchInputs(prisma: PrismaClient, month: string) {
  const { end } = monthRange(month);
  // Выручку и выходы берём с прошлого месяца: первая выплата месяца тянет премию
  // за последнюю смену прошлого месяца, а ручная правка там же двигает границу периода.
  const startD = new Date(`${monthRange(prevMonth(month)).start}T00:00:00.000Z`);
  const endD = new Date(`${end}T00:00:00.000Z`);
  const [emps, revs, atts, dayAdjs, paymentAdjs] = await Promise.all([
    prisma.employee.findMany({ where: { active: true }, orderBy: [{ group: 'asc' }, { name: 'asc' }] }),
    prisma.revenue.findMany({ where: { pointId: 'point-1', date: { gte: startD, lt: endD } }, select: { date: true, amount: true, confectionery: true } }),
    prisma.attendance.findMany({ where: { date: { gte: startD, lt: endD } }, select: { employeeId: true, date: true, present: true } }),
    prisma.payrollDayAdjustment.findMany({ where: { date: { gte: toDbDate(`${month}-01`), lt: endD } } }),
    prisma.payrollPaymentAdjustment.findMany({ where: { month } }),
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
  const dayAdjustments = new Map<string, FotAdjustment>(dayAdjs.map((a) => [`${a.employeeId}|${iso(a.date)}`, { amount: Number(a.amount), note: a.note }]));
  const paymentAdjustments = new Map<string, FotAdjustment>(paymentAdjs.map((a) => [`${a.employeeId}|${a.half}`, { amount: Number(a.amount), note: a.note }]));
  return { employees, revenueByDate, overrides, dayAdjustments, paymentAdjustments };
}

/** Табель за месяц. `upTo` (ISO) ограничивает дни по дату включительно (для дашборда — «по сегодня»). */
export async function loadFot(prisma: PrismaClient, month: string, upTo?: string): Promise<FotView> {
  const inputs = await fetchInputs(prisma, month);
  const days = upTo ? monthDaysOf(month).filter((d) => d <= upTo) : monthDaysOf(month);
  return buildFot({ month, monthDays: days, ...inputs, fixedSalaries: FIXED_SALARIES });
}

/** Сумма ФОТ за месяц (для дашборда). `upTo` — считать только дни ≤ этой даты. */
export async function computePayrollTotal(prisma: PrismaClient, month: string, upTo?: string): Promise<number> {
  return (await loadFot(prisma, month, upTo)).totals.grand;
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

/** Сохранение — установка значения, а не инкремент: повтор запроса не удваивает сумму. */
export async function setPayrollAdjustment(prisma: PrismaClient, input: PayrollAdjustmentInput) {
  const { employeeId, amount } = input;
  const note = input.note || null;
  if (input.kind === 'payment') {
    const { month, half } = input;
    if (amount === 0) return prisma.payrollPaymentAdjustment.deleteMany({ where: { employeeId, month, half } });
    return prisma.payrollPaymentAdjustment.upsert({
      where: { employeeId_month_half: { employeeId, month, half } },
      create: { employeeId, month, half, amount, note },
      update: { amount, note },
    });
  }
  const date = toDbDate(input.date);
  const adjustment = amount === 0
    ? prisma.payrollDayAdjustment.deleteMany({ where: { employeeId, date } })
    : prisma.payrollDayAdjustment.upsert({
      where: { employeeId_date: { employeeId, date } },
      create: { employeeId, date, amount, note },
      update: { amount, note },
    });
  // Если одновременно меняли выход, обе правки сохраняются атомарно.
  return prisma.$transaction([
    adjustment,
    ...(input.present === undefined ? [] : [prisma.attendance.upsert({
      where: { employeeId_date: { employeeId, date } },
      create: { employeeId, date, present: input.present },
      update: { present: input.present },
    })]),
  ]);
}

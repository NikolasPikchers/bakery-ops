import { monthDays } from '@/lib/finance/month';

const MSK_DATE = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow', year: 'numeric', month: '2-digit', day: '2-digit' });
const WEEKDAYS = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
const MONTHS_GEN = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];

/** Сегодня по Москве, 'YYYY-MM-DD'. Сервер живёт в UTC — с 00:00 до 03:00 МСК его дата отстаёт на день. */
export function todayMoscow(now: Date): string {
  return MSK_DATE.format(now);
}

/** Месяц из ?month=YYYY-MM; пусто или мусор — текущий месяц по Москве. */
export function staffMonth(raw: string | undefined, now: Date): string {
  return raw !== undefined && /^\d{4}-(0[1-9]|1[0-2])$/.test(raw) ? raw : todayMoscow(now).slice(0, 7);
}

const utcWeekday = (iso: string) => new Date(`${iso}T00:00:00.000Z`).getUTCDay();

export function weekdayShort(iso: string): string {
  return WEEKDAYS[utcWeekday(iso)];
}

export function dayMonth(iso: string): string {
  return `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
}

export function dayMonthWord(iso: string): string {
  return `${Number(iso.slice(8, 10))} ${MONTHS_GEN[Number(iso.slice(5, 7)) - 1]}`;
}

/** Ячейки календаря месяца с понедельника: пустые до 1-го числа, дальше все даты месяца. */
export function calendarCells(month: string): (string | null)[] {
  const days = monthDays(month);
  const lead = (utcWeekday(days[0]) + 6) % 7;
  return [...Array.from({ length: lead }, () => null), ...days];
}

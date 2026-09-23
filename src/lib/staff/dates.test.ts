import { describe, it, expect } from 'vitest';
import { todayMoscow, staffMonth, weekdayShort, dayMonth, dayMonthWord, calendarCells } from './dates';

describe('todayMoscow', () => {
  it('ночью по Москве уже следующий день, хотя в UTC ещё вчера', () => {
    expect(todayMoscow(new Date('2026-09-22T22:30:00Z'))).toBe('2026-09-23');
  });
  it('днём совпадает с датой UTC', () => {
    expect(todayMoscow(new Date('2026-09-23T10:00:00Z'))).toBe('2026-09-23');
  });
});

describe('staffMonth', () => {
  const now = new Date('2026-09-23T10:00:00Z');
  it('корректный параметр берётся как есть', () => expect(staffMonth('2026-08', now)).toBe('2026-08'));
  it('мусор, 13-й месяц и пусто → текущий месяц по Москве', () => {
    expect(staffMonth('2026-13', now)).toBe('2026-09');
    expect(staffMonth('abc', now)).toBe('2026-09');
    expect(staffMonth(undefined, now)).toBe('2026-09');
  });
  it('в ночь на 1-е по Москве — уже новый месяц', () => {
    expect(staffMonth(undefined, new Date('2026-09-30T21:30:00Z'))).toBe('2026-10');
  });
});

describe('подписи дат', () => {
  it('день недели, ДД.ММ и «15 сен»', () => {
    expect(weekdayShort('2026-09-01')).toBe('вт');
    expect(weekdayShort('2026-09-07')).toBe('пн');
    expect(dayMonth('2026-09-01')).toBe('01.09');
    expect(dayMonthWord('2026-09-15')).toBe('15 сен');
    expect(dayMonthWord('2026-05-01')).toBe('1 мая');
  });
});

describe('calendarCells', () => {
  it('сентябрь 2026 начинается со вторника — одна пустая ячейка', () => {
    const c = calendarCells('2026-09');
    expect(c[0]).toBeNull();
    expect(c[1]).toBe('2026-09-01');
    expect(c).toHaveLength(31);
  });
  it('1 июня 2026 — понедельник: пустых ячеек нет', () => {
    expect(calendarCells('2026-06')[0]).toBe('2026-06-01');
  });
  it('1 ноября 2026 — воскресенье: шесть пустых', () => {
    const c = calendarCells('2026-11');
    expect(c.slice(0, 6)).toEqual([null, null, null, null, null, null]);
    expect(c[6]).toBe('2026-11-01');
  });
});

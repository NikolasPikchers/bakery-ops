import { describe, it, expect } from 'vitest';
import { autoPresent, type SchedEmployee } from './schedule';

const baker = (brigade: 'A' | 'B'): SchedEmployee => ({ role: 'baker', group: 'bakery', brigade, schedOffset: 0 });
const conf = (schedOffset: number): SchedEmployee => ({ role: 'confectioner', group: 'confectionery', brigade: null, schedOffset });
const kitchen: SchedEmployee = { role: 'kitchen', group: 'bakery', brigade: null, schedOffset: 0 };

describe('autoPresent', () => {
  it('бригады A/B 2/2: A=08-08, B=09-10, A=11-12 (опора 07.06)', () => {
    // 08 — A, 09-10 — B (первый день B = 09), 11-12 — A, 13 — B
    expect([8, 9, 10, 11, 12, 13].map((d) => autoPresent(baker('A'), `2026-06-${d}`))).toEqual([true, false, false, true, true, false]);
    expect([8, 9, 10, 11, 12, 13].map((d) => autoPresent(baker('B'), `2026-06-${d}`))).toEqual([false, true, true, false, false, true]);
  });
  it('кондитеры со сдвигом', () => {
    expect([8, 9, 10, 11].map((d) => autoPresent(conf(0), `2026-06-${d}`))).toEqual([true, true, false, false]); // Лена
    expect([8, 9, 10, 11].map((d) => autoPresent(conf(1), `2026-06-${d}`))).toEqual([false, true, true, false]); // Оксана
    expect([8, 9, 10, 11].map((d) => autoPresent(conf(2), `2026-06-${d}`))).toEqual([false, false, true, true]); // Лариса
  });
  it('кухня Пн–Пт', () => {
    expect(autoPresent(kitchen, '2026-06-08')).toBe(true); // Пн
    expect(autoPresent(kitchen, '2026-06-13')).toBe(false); // Сб
    expect(autoPresent(kitchen, '2026-06-14')).toBe(false); // Вс
  });
});

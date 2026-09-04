import { describe, it, expect } from 'vitest';
import { compareWindow } from './compare-window';

describe('compareWindow', () => {
  it('текущий месяц: окно 1..D, D — последняя дата с выручкой (4 сентября)', () => {
    const w = compareWindow({ month: '2026-09', todayIso: '2026-09-04', lastRevenueDate: '2026-09-04' });
    expect(w).toEqual({ mode: 'mtd', curUpTo: '2026-09-04', prevUpTo: '2026-08-04', label: 'к 1–4 авг.' });
  });

  it('выручка отстаёт от сегодня → D по последней выручке, не по сегодня', () => {
    const w = compareWindow({ month: '2026-09', todayIso: '2026-09-04', lastRevenueDate: '2026-09-03' });
    expect(w).toEqual({ mode: 'mtd', curUpTo: '2026-09-03', prevUpTo: '2026-08-03', label: 'к 1–3 авг.' });
  });

  it('клампинг: 31 марта против февраля из 28 дней', () => {
    const w = compareWindow({ month: '2026-03', todayIso: '2026-03-31', lastRevenueDate: '2026-03-31' });
    expect(w).toEqual({ mode: 'mtd', curUpTo: '2026-03-31', prevUpTo: '2026-02-28', label: 'к 1–28 фев.' });
  });

  it('текущий месяц без выручки → D = сегодняшнее число', () => {
    const w = compareWindow({ month: '2026-09', todayIso: '2026-09-04', lastRevenueDate: null });
    expect(w).toEqual({ mode: 'mtd', curUpTo: '2026-09-04', prevUpTo: '2026-08-04', label: 'к 1–4 авг.' });
  });

  it('закрытый месяц → полный месяц к полному, подпись прежняя', () => {
    const w = compareWindow({ month: '2026-08', todayIso: '2026-09-04', lastRevenueDate: '2026-08-31' });
    expect(w).toEqual({ mode: 'full', label: 'к пр. месяцу' });
  });

  it('первое число месяца → «к 1 …» без диапазона', () => {
    const w = compareWindow({ month: '2026-09', todayIso: '2026-09-01', lastRevenueDate: null });
    expect(w).toEqual({ mode: 'mtd', curUpTo: '2026-09-01', prevUpTo: '2026-08-01', label: 'к 1 авг.' });
  });

  it('выручка из чужого месяца игнорируется (защита от мусора)', () => {
    const w = compareWindow({ month: '2026-09', todayIso: '2026-09-04', lastRevenueDate: '2026-08-31' });
    expect(w).toEqual({ mode: 'mtd', curUpTo: '2026-09-04', prevUpTo: '2026-08-04', label: 'к 1–4 авг.' });
  });
});

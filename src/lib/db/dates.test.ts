import { describe, it, expect } from 'vitest';
import { toDbDate } from './dates';

describe('toDbDate', () => {
  it('ISO YYYY-MM-DD → UTC-полночь Date', () => {
    expect(toDbDate('2026-06-06').toISOString()).toBe('2026-06-06T00:00:00.000Z');
  });
});

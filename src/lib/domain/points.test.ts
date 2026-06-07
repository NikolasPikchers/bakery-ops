import { describe, it, expect } from 'vitest';
import { POINTS, pointName, pointIdFromInput } from './points';

describe('points', () => {
  it('has exactly the two bakery points with ids and ru names', () => {
    expect(POINTS).toEqual([
      { id: 'point-1', name: 'Плюшкино' },
      { id: 'point-2', name: 'Корица' },
    ]);
  });
  it('pointName maps id to name, falls back to id', () => {
    expect(pointName('point-1')).toBe('Плюшкино');
    expect(pointName('point-2')).toBe('Корица');
    expect(pointName('unknown')).toBe('unknown');
  });
  it('pointIdFromInput resolves by id or by name (case-insensitive)', () => {
    expect(pointIdFromInput('point-1')).toBe('point-1');
    expect(pointIdFromInput('Корица')).toBe('point-2');
    expect(pointIdFromInput('  плюшкино ')).toBe('point-1');
    expect(pointIdFromInput('нет такой')).toBeNull();
  });
});

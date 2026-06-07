import { describe, it, expect } from 'vitest';
import { computeImageHash } from './image-hash';

describe('computeImageHash', () => {
  it('SHA-256 hex от известного входа', () => {
    expect(computeImageHash(Buffer.from('abc'))).toBe(
      'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad',
    );
  });

  it('детерминирован и различает разные входы', () => {
    const a = computeImageHash(Buffer.from('photo-1'));
    const b = computeImageHash(Buffer.from('photo-1'));
    const c = computeImageHash(Buffer.from('photo-2'));
    expect(a).toBe(b);
    expect(a).not.toBe(c);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });
});

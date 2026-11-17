import { afterEach, describe, expect, it, vi } from 'vitest';
import { nextIikoSyncAt, startIikoScheduler } from './scheduler';

afterEach(() => vi.useRealTimers());

describe('daily iiko scheduler', () => {
  it('runs at 04:00 Moscow and rolls over month and year boundaries', () => {
    expect(nextIikoSyncAt(new Date('2026-11-17T00:59:00Z')).toISOString()).toBe('2026-11-17T01:00:00.000Z');
    expect(nextIikoSyncAt(new Date('2026-11-17T01:00:00Z')).toISOString()).toBe('2026-11-18T01:00:00.000Z');
    expect(nextIikoSyncAt(new Date('2026-12-31T20:00:00Z')).toISOString()).toBe('2027-01-01T01:00:00.000Z');
  });

  it('runs once at the scheduled time and can be stopped', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-17T00:59:00Z') });
    const run = vi.fn().mockResolvedValue(undefined);
    const stop = startIikoScheduler(run);
    await vi.advanceTimersByTimeAsync(59_999);
    expect(run).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    expect(run).toHaveBeenCalledTimes(1);
    stop();
    await vi.advanceTimersByTimeAsync(86_400_000);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('retries a temporary outage after five minutes without waiting another day', async () => {
    vi.useFakeTimers({ now: new Date('2026-11-17T00:59:00Z') });
    const failure = new Error('iiko unavailable');
    const run = vi.fn().mockRejectedValueOnce(failure).mockResolvedValue(undefined);
    const onError = vi.fn();
    const stop = startIikoScheduler(run, onError);
    await vi.advanceTimersByTimeAsync(60_000);
    expect(onError).toHaveBeenCalledWith(failure);
    await vi.advanceTimersByTimeAsync(300_000);
    expect(run).toHaveBeenCalledTimes(2);
    stop();
  });
});

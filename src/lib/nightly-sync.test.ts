import { describe, expect, it, vi } from 'vitest';
import { runNightlySync } from './nightly-sync';

describe('runNightlySync — ночные синхронизации', () => {
  it('запускает все задачи и пишет итог каждой', async () => {
    const log = vi.fn();
    await runNightlySync([
      { name: 'iiko', run: async () => ({ days: 2 }) },
      { name: 'tbank', run: async () => ({ imported: 3 }) },
    ], log);
    const logged = log.mock.calls.flat().join(' ');
    expect(logged).toContain('Scheduled iiko sync');
    expect(logged).toContain('Scheduled tbank sync');
    expect(logged).toContain('imported');
  });

  it('падение одной не мешает другой; в конце — ошибка с именем упавшей (для повтора)', async () => {
    const tbank = vi.fn(async () => ({ imported: 1 }));
    const err = await runNightlySync(
      [
        { name: 'iiko', run: async () => { throw new Error('iiko down'); } },
        { name: 'tbank', run: tbank },
      ],
      () => {},
    ).catch((e: Error) => e);
    expect(tbank).toHaveBeenCalled();
    expect(String(err)).toMatch(/iiko.*iiko down/);
  });
});

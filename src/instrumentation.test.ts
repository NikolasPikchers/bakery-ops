import { afterEach, describe, expect, it, vi } from 'vitest';
import { register } from './instrumentation';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('register — старт сервера', () => {
  it('в Node пишет в лог, как приложение видит настройки базы (без пароля), даже без планировщика iiko', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'nodejs');
    vi.stubEnv('IIKO_SCHEDULER_ENABLED', '0');
    vi.stubEnv('DATABASE_URL', 'postgresql://bakery_app:secret@db.twc1.net:5432/default_db');
    vi.stubEnv('DATABASE_CA_CERT', '');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await register();
    const logged = log.mock.calls.flat().join(' ');
    expect(logged).toContain('db.twc1.net:5432/default_db');
    expect(logged).not.toContain('secret');
  });

  it('в edge-рантайме ничего не делает', async () => {
    vi.stubEnv('NEXT_RUNTIME', 'edge');
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    await register();
    expect(log).not.toHaveBeenCalled();
  });
});

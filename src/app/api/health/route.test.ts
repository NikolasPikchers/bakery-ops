import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const { query } = vi.hoisted(() => ({ query: vi.fn() }));
vi.mock('@/lib/db/client', () => ({ getPrisma: () => ({ $queryRaw: query }) }));

beforeEach(() => vi.clearAllMocks());

describe('deployment healthcheck', () => {
  it('is ready only after a successful database query', async () => {
    query.mockResolvedValue([{ ready: 1 }]);
    const response = await GET();
    expect(response.status).toBe(200);
    expect(query).toHaveBeenCalledOnce();
    expect(await response.json()).toMatchObject({ status: 'ok' });
  });

  it('fails the deployment when PostgreSQL is unreachable without exposing credentials', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    query.mockRejectedValue(new Error('postgres://user:secret@private-host/db'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret');
  });

  it('пишет в лог причину отказа базы — иначе деплой падает молча', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    const err = Object.assign(new Error('connect ETIMEDOUT 5.129.201.3:5432'), { code: 'ETIMEDOUT' });
    query.mockRejectedValue(err);
    await GET();
    const logged = log.mock.calls.flat().join(' ');
    expect(logged).toContain('ETIMEDOUT');
  });

  it('в логе нет логина и пароля из строки подключения', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    query.mockRejectedValue(new Error('failed for postgresql://bakery_app:secret@db.twc1.net:5432/default_db'));
    await GET();
    const logged = log.mock.calls.flat().join(' ');
    expect(logged).toContain('failed for');
    expect(logged).not.toContain('secret');
    expect(logged).not.toContain('bakery_app');
  });

  it('причину из вложенной ошибки (cause) тоже видно', async () => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    query.mockRejectedValue(new Error('Connection terminated', { cause: new Error('self-signed certificate in certificate chain') }));
    await GET();
    expect(log.mock.calls.flat().join(' ')).toContain('self-signed certificate');
  });
});

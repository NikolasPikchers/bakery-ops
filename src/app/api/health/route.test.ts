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
    query.mockRejectedValue(new Error('postgres://user:secret@private-host/db'));
    const response = await GET();
    expect(response.status).toBe(503);
    expect(await response.text()).not.toContain('secret');
  });
});

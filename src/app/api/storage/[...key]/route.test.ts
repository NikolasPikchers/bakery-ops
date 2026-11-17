import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GET } from './route';

const { owner, read } = vi.hoisted(() => ({ owner: vi.fn(), read: vi.fn() }));
vi.mock('@/lib/auth/require-owner', () => ({ requireOwner: owner }));
vi.mock('@/lib/storage/s3', async (original) => ({
  ...(await original<typeof import('@/lib/storage/s3')>()),
  getS3BlobStore: () => ({ read }),
}));

const request = () => new Request('http://localhost/api/storage/sheets/sheet-1.jpg');
const params = { params: Promise.resolve({ key: ['sheets', 'sheet-1.jpg'] }) };

beforeEach(() => {
  vi.clearAllMocks();
  owner.mockResolvedValue({ role: 'owner' });
});

describe('private sheet photos', () => {
  it.each([401, 403])('does not read S3 when access is denied (%s)', async (status) => {
    owner.mockResolvedValue(Response.json({ error: 'denied' }, { status }));
    expect((await GET(request(), params)).status).toBe(status);
    expect(read).not.toHaveBeenCalled();
  });

  it('serves the original photo to the owner without a public bucket', async () => {
    read.mockResolvedValue({ bytes: new Uint8Array([1, 2, 3]), contentType: 'image/jpeg' });
    const response = await GET(request(), params);
    expect(read).toHaveBeenCalledWith('sheets/sheet-1.jpg');
    expect(response.headers.get('content-type')).toBe('image/jpeg');
    expect(response.headers.get('cache-control')).toContain('private');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
  });

  it('rejects bucket paths outside sheet photos before any S3 request', async () => {
    const response = await GET(request(), { params: Promise.resolve({ key: ['secrets', '.env'] }) });
    expect(response.status).toBe(404);
    expect(read).not.toHaveBeenCalled();
  });
});

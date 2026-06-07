import { put } from '@vercel/blob';

export type BlobStore = {
  put(key: string, bytes: Uint8Array, contentType: string): Promise<{ url: string }>;
};

/** Реальное хранилище (Vercel Blob). Токен берётся из env BLOB_READ_WRITE_TOKEN. */
export const vercelBlobStore: BlobStore = {
  async put(key, bytes, contentType) {
    const res = await put(key, Buffer.from(bytes), {
      access: 'public',
      contentType,
      addRandomSuffix: false,
    });
    return { url: res.url };
  },
};

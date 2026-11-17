import { requireOwner } from '@/lib/auth/require-owner';
import { getS3BlobStore, isSheetImageKey } from '@/lib/storage/s3';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(_request: Request, { params }: { params: Promise<{ key: string[] }> }) {
  const session = await requireOwner();
  if (session instanceof Response) return session;

  const key = (await params).key.join('/');
  if (!isSheetImageKey(key)) return new Response('Not found', { status: 404 });

  try {
    const image = await getS3BlobStore().read(key);
    return new Response(new Uint8Array(image.bytes), {
      headers: { 'content-type': image.contentType, 'cache-control': 'private, no-store', 'x-content-type-options': 'nosniff' },
    });
  } catch (error) {
    if (error instanceof Error && ['NoSuchKey', 'NotFound'].includes(error.name)) return new Response('Not found', { status: 404 });
    console.error('Sheet image storage is unavailable');
    return new Response('Image storage unavailable', { status: 503 });
  }
}

import { Agent, request } from 'node:https';

const NULL_BODY = new Set([101, 204, 205, 304]);

/**
 * Минимальный fetch поверх node:https со своим списком доверенных CA. Нужен, чтобы доверять
 * сертификатам Минцифры только в запросах к банку, не трогая TLS остального приложения
 * (NODE_EXTRA_CA_CERTS расширил бы доверие для всех соединений).
 */
export function httpsFetch(ca: string[]): typeof fetch {
  const agent = new Agent({ ca, keepAlive: true });
  return (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(typeof input === 'string' || input instanceof URL ? input : input.url);
    return new Promise<Response>((resolve, reject) => {
      const req = request(
        url,
        { method: init?.method ?? 'GET', headers: init?.headers as Record<string, string> | undefined, agent, signal: init?.signal ?? undefined },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('error', reject);
          res.on('end', () => {
            const status = res.statusCode ?? 0;
            const headers = new Headers();
            for (const [k, v] of Object.entries(res.headers)) {
              if (Array.isArray(v)) v.forEach((x) => headers.append(k, x));
              else if (v !== undefined) headers.set(k, String(v));
            }
            resolve(new Response(NULL_BODY.has(status) ? null : Buffer.concat(chunks), { status, headers }));
          });
        },
      );
      req.on('error', reject);
      req.end(typeof init?.body === 'string' ? init.body : undefined);
    });
  }) as typeof fetch;
}

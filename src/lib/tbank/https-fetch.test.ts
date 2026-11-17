import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { createServer, type Server } from 'node:https';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { X509Certificate } from 'node:crypto';
import { httpsFetch } from './https-fetch';
import { RUSSIAN_TRUSTED_ROOT_CA, RUSSIAN_TRUSTED_SUB_CA } from './russian-ca';

// Локальный HTTPS-сервер с самоподписанным сертификатом (генерируется openssl на время теста).
let server: Server;
let base: string;
let cert: string;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'tbank-tls-'));
  execFileSync('openssl', ['req', '-x509', '-newkey', 'rsa:2048', '-nodes', '-days', '1', '-subj', '/CN=localhost',
    '-addext', 'subjectAltName=DNS:localhost,IP:127.0.0.1', '-keyout', join(dir, 'k'), '-out', join(dir, 'c')], { stdio: 'ignore' });
  cert = readFileSync(join(dir, 'c'), 'utf8');
  server = createServer({ key: readFileSync(join(dir, 'k')), cert }, (req, res) => {
    if (req.url === '/empty') {
      res.writeHead(204);
      res.end();
      return;
    }
    res.writeHead(req.headers.authorization === 'Bearer t' ? 200 : 401, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ path: req.url }));
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `https://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('httpsFetch — fetch с собственным списком доверенных CA', () => {
  it('доверяет переданному CA: статус, заголовки и тело как у fetch', async () => {
    const res = await httpsFetch([cert])(`${base}/x?a=1`, { headers: { Authorization: 'Bearer t' } });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toBe('application/json');
    expect(await res.json()).toEqual({ path: '/x?a=1' });
  });

  it('204 без тела — не падает', async () => {
    expect((await httpsFetch([cert])(`${base}/empty`)).status).toBe(204);
  });

  it('чужой сертификат — ошибка TLS с кодом, а не тихий успех', async () => {
    const err = await httpsFetch([RUSSIAN_TRUSTED_ROOT_CA])(`${base}/x`).catch((e: NodeJS.ErrnoException) => e);
    expect(String((err as NodeJS.ErrnoException).code)).toMatch(/SELF_SIGNED|UNABLE_TO_VERIFY|CERT/);
  });
});

describe('сертификаты Минцифры', () => {
  it('корневой — тот, что опубликован на Госуслугах (SHA-256)', () => {
    expect(new X509Certificate(RUSSIAN_TRUSTED_ROOT_CA).fingerprint256).toBe(
      'D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31',
    );
  });
  it('промежуточный подписан корневым', () => {
    const sub = new X509Certificate(RUSSIAN_TRUSTED_SUB_CA);
    expect(sub.checkIssued(new X509Certificate(RUSSIAN_TRUSTED_ROOT_CA))).toBe(true);
  });
});

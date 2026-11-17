import { X509Certificate } from 'node:crypto';
import type { PoolConfig } from 'pg';

type Env = Record<string, string | undefined>;

/** Убирает логин и пароль из строк подключения вида scheme://user:pass@host. */
function redact(text: string): string {
  return text.replace(/([a-z][a-z0-9+.-]*:\/\/)[^\s/@]+@/gi, '$1***@');
}

/**
 * Что видит приложение в настройках базы — для лога при старте. Только хост, порт, база
 * и разбор сертификата: так в логах деплоя видно, дошли ли DATABASE_URL и DATABASE_CA_CERT целыми.
 */
export function describeDatabaseConfig(env: Env = process.env): string {
  let url: string;
  if (!env.DATABASE_URL) url = 'DATABASE_URL: нет';
  else {
    try {
      const u = new URL(env.DATABASE_URL);
      url = `DATABASE_URL: ${u.hostname}:${u.port || '5432'}${u.pathname}`;
    } catch {
      url = 'DATABASE_URL: не URL';
    }
  }

  let ca: string;
  if (!env.DATABASE_CA_CERT) ca = 'CA: нет';
  else {
    try {
      const cert = new X509Certificate(env.DATABASE_CA_CERT.replace(/\\n/g, '\n'));
      const cn = /CN=([^\n,]+)/.exec(cert.subject)?.[1] ?? '?';
      ca = `CA: ok, CN=${cn}, до ${new Date(cert.validTo).toISOString().slice(0, 10)}`;
    } catch (error) {
      ca = `CA: не разбирается (${error instanceof Error ? error.message : String(error)})`;
    }
  }
  return `${url}; ${ca}`;
}

/** Причина ошибки базы для лога: имя, код и текст по цепочке cause, без логина и пароля. */
export function describeDatabaseError(error: unknown): string {
  const parts: string[] = [];
  let current: unknown = error;
  for (let depth = 0; current && depth < 4; depth += 1) {
    if (current instanceof Error) {
      const code = (current as Error & { code?: unknown }).code;
      parts.push(`${current.name}${code ? ` [${String(code)}]` : ''}: ${current.message}`);
      current = current.cause;
    } else {
      parts.push(String(current));
      break;
    }
  }
  return redact(parts.join(' ← ')).slice(0, 800);
}

/** Timeweb uses a provider CA; keep TLS verification enabled for its database domain. */
export function databaseOptions(env: Env = process.env): PoolConfig {
  const options: PoolConfig = { connectionString: env.DATABASE_URL, connectionTimeoutMillis: 10_000, query_timeout: 15_000 };
  if (env.DATABASE_CA_CERT && env.DATABASE_URL) {
    const url = new URL(env.DATABASE_URL);
    for (const key of ['sslmode', 'sslcert', 'sslkey', 'sslrootcert']) url.searchParams.delete(key);
    options.connectionString = url.toString();
    options.ssl = { ca: env.DATABASE_CA_CERT.replace(/\\n/g, '\n'), rejectUnauthorized: true };
  }
  return options;
}

import type { Session } from 'next-auth';
import { auth } from '@/auth';
import { roleOf } from './roles';

/**
 * Охрана API-роутов владельца. Владелец — возвращаем его сессию (роутам нужно имя),
 * иначе готовый ответ: 401 — сессии нет или она отозвана, 403 — сотрудник.
 */
export async function requireOwner(): Promise<Session | Response> {
  const session = await auth();
  const role = roleOf(session);
  if (!session || role === null) return Response.json({ error: 'Unauthorized', code: 'AUTH' }, { status: 401 });
  if (role !== 'owner') return Response.json({ error: 'Forbidden', code: 'FORBIDDEN' }, { status: 403 });
  return session;
}

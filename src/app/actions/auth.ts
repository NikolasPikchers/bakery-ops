'use server';

import { signOut } from '@/auth';

/** Выход: сессия сбрасывается, дальше — страница входа, где можно войти под другим паролем. */
export async function logout(): Promise<void> {
  await signOut({ redirectTo: '/login' });
}

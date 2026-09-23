import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';
import { effectiveRole, resolveRole, staffFingerprint, type RoleEnv } from '@/lib/auth/roles';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { password: { label: 'Пароль', type: 'password' } },
      authorize: async (creds) => {
        const password = typeof creds?.password === 'string' ? creds.password : '';
        const role = resolveRole(password, process.env as RoleEnv);
        if (role === null) return null;
        const fp = role === 'staff' ? await staffFingerprint(process.env.STAFF_PASSWORD ?? '', process.env.AUTH_SECRET ?? '') : undefined;
        const user = { id: role, name: role === 'owner' ? 'Пекарня' : 'Сотрудник', role, fp };
        return user;
      },
    }),
  ],
  callbacks: {
    authorized: ({ auth }) => !!auth,
    jwt: ({ token, user }) => {
      if (user) {
        const u = user as { role?: string; fp?: string };
        token.role = u.role;
        token.fp = u.fp;
      }
      return token;
    },
    // Роль пересчитывается на каждом запросе: так смена STAFF_PASSWORD сразу отзывает сессии сотрудников.
    session: async ({ session, token }) =>
      Object.assign(session, { role: await effectiveRole({ role: token.role, fp: token.fp }, process.env as RoleEnv) }),
  },
});

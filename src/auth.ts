import NextAuth from 'next-auth';
import Credentials from 'next-auth/providers/credentials';

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { password: { label: 'Пароль', type: 'password' } },
      authorize: (creds) => {
        const password = typeof creds?.password === 'string' ? creds.password : '';
        const expected = process.env.APP_PASSWORD ?? '';
        if (expected.length > 0 && password === expected) {
          return { id: 'owner', name: 'Пекарня' };
        }
        return null;
      },
    }),
  ],
  callbacks: {
    authorized: ({ auth }) => !!auth,
  },
});

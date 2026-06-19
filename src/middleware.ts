import { NextResponse } from 'next/server';
import { auth } from '@/auth';

// Защищаем страницы и API. Исключаем next-auth, телеграм-вебхук, статику и саму /login.
// Страницы без сессии → редирект на /login; API без сессии → 401 JSON (чтобы fetch
// на клиенте получил понятный статус, а не HTML-страницу логина и не «молчал»).
export default auth((req) => {
  if (req.auth) return; // авторизован — пропускаем
  const { pathname, origin } = req.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized', code: 'AUTH' }, { status: 401 });
  }
  return NextResponse.redirect(new URL('/login', origin));
});

export const config = {
  matcher: ['/((?!api/auth|api/telegram|login|_next/static|_next/image|favicon.ico).*)'],
};

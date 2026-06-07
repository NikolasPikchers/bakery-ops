export { auth as middleware } from '@/auth';

// Защищаем страницы. Исключаем next-auth, будущий телеграм-вебхук, статику и саму /login.
// Прочие API-маршруты сами вызывают auth() и отдают 401.
export const config = {
  matcher: ['/((?!api/auth|api/telegram|login|_next/static|_next/image|favicon.ico).*)'],
};

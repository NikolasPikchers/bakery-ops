import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { accessDecision, roleOf } from '@/lib/auth/roles';

// Правило «кто куда» — accessDecision (src/lib/auth/roles.ts). Для API — JSON с кодом,
// чтобы fetch на клиенте получил понятный статус, а не HTML-страницу логина.
export default auth((req) => {
  const decision = accessDecision(roleOf(req.auth), req.nextUrl.pathname);
  if (decision.kind === 'allow') return;
  if (decision.kind === 'deny') {
    const body = decision.status === 401 ? { error: 'Unauthorized', code: 'AUTH' } : { error: 'Forbidden', code: 'FORBIDDEN' };
    return NextResponse.json(body, { status: decision.status });
  }
  return NextResponse.redirect(new URL(decision.to, req.nextUrl.origin));
});

export const config = {
  matcher: ['/((?!api/auth|api/telegram|login|_next/static|_next/image|favicon.ico).*)'],
};

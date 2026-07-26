import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/questionnaire', '/meal-plan', '/chat', '/photo-analysis'];
const AUTH_ROUTES = ['/login', '/signup'];
const TERMS_ROUTE = '/accept-terms';

function hasAuthCookie(request: NextRequest): boolean {
  return request.cookies.getAll().some(
    (c) => c.name.startsWith('sb-') && c.name.endsWith('-auth-token')
  );
}

export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const authenticated = hasAuthCookie(request);

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuth = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  if (!authenticated && (isProtected || pathname === TERMS_ROUTE)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (authenticated && isAuth) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Repassa o pathname num header pra src/app/(app)/layout.tsx saber,
  // sem prop drilling, se a rota atual precisa ficar acessível mesmo
  // com termos desatualizados (ver TERMS_GATE_EXEMPT_PREFIXES lá —
  // cancelar assinatura ou excluir conta nunca pode depender de aceitar
  // novos termos primeiro).
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  return NextResponse.next({ request: { headers: requestHeaders } });
}

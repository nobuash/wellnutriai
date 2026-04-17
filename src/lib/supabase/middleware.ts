import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/questionnaire', '/meal-plan', '/chat', '/photo-analysis'];
const AUTH_ROUTES = ['/login', '/signup'];
const TERMS_ROUTE = '/accept-terms';

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const { data: { user } } = await supabase.auth.getUser();
  const { pathname } = request.nextUrl;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuth = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  // Não logado em rota protegida → login
  if (!user && (isProtected || pathname === TERMS_ROUTE)) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  // Logado tentando acessar login/signup → dashboard
  if (user && isAuth) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Logado em rota protegida: verificar aceite dos termos (BLOCKING FLOW)
  if (user && isProtected) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('accepted_terms')
      .eq('id', user.id)
      .single();

    if (!profile?.accepted_terms) {
      const url = request.nextUrl.clone();
      url.pathname = TERMS_ROUTE;
      return NextResponse.redirect(url);
    }
  }

  // Logado já aceitou termos mas está em /accept-terms → dashboard
  if (user && pathname === TERMS_ROUTE) {
    const { data: profile } = await supabase
      .from('profiles')
      .select('accepted_terms')
      .eq('id', user.id)
      .single();

    if (profile?.accepted_terms) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard';
      return NextResponse.redirect(url);
    }
  }

  return response;
}

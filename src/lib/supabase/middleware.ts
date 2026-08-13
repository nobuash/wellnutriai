import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED_PREFIXES = ['/dashboard', '/questionnaire', '/meal-plan', '/chat', '/photo-analysis'];
const AUTH_ROUTES = ['/login', '/signup'];
const TERMS_ROUTE = '/accept-terms';

/**
 * CONFIRMADO: a versão anterior (hasAuthCookie) só checava se existia
 * um cookie com nome parecido com sb-*-auth-token — nunca verificava
 * se o token era válido. Isso causava um loop de redirecionamento real
 * sempre que o cookie existisse mas a sessão estivesse inválida/expirada
 * (ex: falha temporária na API de Auth do Supabase): o middleware
 * deixava passar pro /dashboard achando que estava autenticado, o
 * layout tentava validar de verdade e falhava, redirecionava pro
 * /login, o middleware via o mesmo cookie de novo e mandava de volta
 * pro /dashboard — ERR_TOO_MANY_REDIRECTS.
 *
 * Agora o middleware cria o client de verdade e chama
 * supabase.auth.getClaims() (verificação real do JWT) — nunca confia
 * só na presença do nome de um cookie. Não execute nenhum código entre
 * createServerClient() e getClaims() — um early return ali quebra a
 * renovação de sessão de forma difícil de depurar.
 */
export async function updateSession(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-pathname', pathname);

  let supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request: { headers: requestHeaders } });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  // getClaims() verifica o JWT de verdade (localmente quando o projeto
  // usa chaves assimétricas, com fallback automático pra uma checagem
  // equivalente a getUser() caso contrário) — nunca confia só na
  // presença de um cookie com nome parecido, e dispara o refresh do
  // token quando o access token expirou mas o refresh token ainda é
  // válido, escrevendo os cookies renovados via setAll acima.
  const { data, error } = await supabase.auth.getClaims();
  const authenticated = !error && !!data?.claims;

  const isProtected = PROTECTED_PREFIXES.some((p) => pathname.startsWith(p));
  const isAuth = AUTH_ROUTES.some((p) => pathname.startsWith(p));

  if (!authenticated && (isProtected || pathname === TERMS_ROUTE)) {
    return redirectPreservingCookies(request, '/login', supabaseResponse);
  }

  if (authenticated && isAuth) {
    return redirectPreservingCookies(request, '/dashboard', supabaseResponse);
  }

  // IMPORTANTE: retornar exatamente supabaseResponse (não uma response
  // nova) — é ela que carrega os cookies renovados pelo setAll acima.
  return supabaseResponse;
}

function redirectPreservingCookies(request: NextRequest, path: string, supabaseResponse: NextResponse) {
  const url = request.nextUrl.clone();
  url.pathname = path;
  const redirectResponse = NextResponse.redirect(url);
  // Um redirect cria uma response nova por natureza — precisa copiar
  // manualmente os cookies que o setAll já gravou em supabaseResponse,
  // ou a renovação de sessão desta requisição se perde.
  supabaseResponse.cookies.getAll().forEach((cookie) => {
    redirectResponse.cookies.set(cookie);
  });
  return redirectResponse;
}

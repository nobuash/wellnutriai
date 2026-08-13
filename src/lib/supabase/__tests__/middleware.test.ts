import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mocka @supabase/ssr inteiro: o objetivo destes testes não é reverificar
// a lógica interna de verificação de JWT da biblioteca (isso é
// responsabilidade dela, já testada upstream), e sim provar que
// src/lib/supabase/middleware.ts (a) nunca decide autenticação a partir
// de nomes de cookie ou headers, só do resultado de getClaims(); (b)
// sempre repassa TODOS os cookies da request pro getAll() (inclusive
// fragmentados/falsos — quem decide validade é a verificação de JWT,
// não este código); (c) nunca cria uma response nova sem copiar os
// cookies renovados pelo setAll().
let getClaimsResult: { data: { claims: Record<string, unknown> | null }; error: unknown } = {
  data: { claims: null },
  error: { message: 'no session' },
};
let cookiesToSetOnRefresh: { name: string; value: string; options?: Record<string, unknown> }[] = [];
let capturedGetAll: (() => { name: string; value: string }[]) | null = null;

vi.mock('@supabase/ssr', () => ({
  createServerClient: (_url: string, _key: string, opts: {
    cookies: {
      getAll: () => { name: string; value: string }[];
      setAll: (cookies: { name: string; value: string; options?: Record<string, unknown> }[]) => void;
    };
  }) => {
    capturedGetAll = opts.cookies.getAll;
    // Simula o que a lib real faz internamente ao renovar um token
    // expirado: chama setAll com os cookies novos antes de resolver.
    if (cookiesToSetOnRefresh.length > 0) {
      opts.cookies.setAll(cookiesToSetOnRefresh);
    }
    return {
      auth: {
        getClaims: async () => getClaimsResult,
      },
    };
  },
}));

// import depois do mock, como os outros testes da base fazem
const { updateSession } = await import('@/lib/supabase/middleware');

function makeRequest(path: string, opts: { cookies?: Record<string, string>; headers?: Record<string, string> } = {}) {
  const headers = new Headers(opts.headers ?? {});
  if (opts.cookies) {
    const cookieHeader = Object.entries(opts.cookies).map(([k, v]) => `${k}=${v}`).join('; ');
    headers.set('cookie', cookieHeader);
  }
  return new NextRequest(new URL(path, 'https://app.example.com'), { headers });
}

beforeEach(() => {
  getClaimsResult = { data: { claims: null }, error: { message: 'no session' } };
  cookiesToSetOnRefresh = [];
  capturedGetAll = null;
});

afterEach(() => {
  vi.clearAllMocks();
});

describe('updateSession — decisão de autenticação nunca vem de cookie/header, só de getClaims()', () => {
  it('token válido: usuário autenticado acessa rota protegida sem redirect', async () => {
    getClaimsResult = { data: { claims: { sub: 'user-1' } }, error: null };
    const req = makeRequest('/dashboard', { cookies: { 'sb-project-auth-token': 'valid.jwt.here' } });
    const res = await updateSession(req);
    expect(res.status).not.toBe(307);
    expect(res.headers.get('location')).toBeNull();
  });

  it('token expirado com refresh: getClaims() sucede após renovar, e os cookies renovados aparecem na response', async () => {
    getClaimsResult = { data: { claims: { sub: 'user-1' } }, error: null };
    cookiesToSetOnRefresh = [
      { name: 'sb-project-auth-token', value: 'novo.jwt.renovado', options: { path: '/' } },
    ];
    const req = makeRequest('/dashboard', { cookies: { 'sb-project-auth-token': 'expirado.jwt.antigo' } });
    const res = await updateSession(req);
    expect(res.status).not.toBe(307);
    const setCookie = res.cookies.get('sb-project-auth-token');
    expect(setCookie?.value).toBe('novo.jwt.renovado');
  });

  it('refresh inválido: getClaims() retorna erro mesmo com cookie presente → redireciona pra login em rota protegida', async () => {
    getClaimsResult = { data: { claims: null }, error: { message: 'refresh_token_not_found' } };
    const req = makeRequest('/dashboard', { cookies: { 'sb-project-auth-token': 'refresh.invalido' } });
    const res = await updateSession(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('cookie falso com nome parecido não autentica — só o resultado de getClaims() decide', async () => {
    // Mesmo com um cookie de nome idêntico ao padrão real do Supabase,
    // se getClaims() (verificação de JWT de verdade) rejeitar, o
    // middleware não pode conceder acesso só por causa do nome do cookie
    // — esse era exatamente o bug do middleware antigo (hasAuthCookie
    // só checava prefixo/sufixo do nome, nunca o conteúdo) que causou
    // o loop de ERR_TOO_MANY_REDIRECTS confirmado em produção local.
    getClaimsResult = { data: { claims: null }, error: { message: 'invalid signature' } };
    const req = makeRequest('/dashboard', { cookies: { 'sb-project-auth-token': 'forjado-nao-e-um-jwt-valido' } });
    const res = await updateSession(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('cookie fragmentado: getAll() repassado ao client inclui todos os fragmentos, sem filtrar por nome', async () => {
    getClaimsResult = { data: { claims: { sub: 'user-1' } }, error: null };
    const req = makeRequest('/dashboard', {
      cookies: {
        'sb-project-auth-token.0': 'parte1',
        'sb-project-auth-token.1': 'parte2',
      },
    });
    await updateSession(req);
    expect(capturedGetAll).not.toBeNull();
    const all = capturedGetAll!().map((c) => c.name).sort();
    expect(all).toEqual(['sb-project-auth-token.0', 'sb-project-auth-token.1']);
  });

  it('ausência de cookie: rota protegida redireciona pra login', async () => {
    getClaimsResult = { data: { claims: null }, error: { message: 'no session' } };
    const req = makeRequest('/dashboard');
    const res = await updateSession(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('ausência de cookie em rota pública: passa sem redirect', async () => {
    getClaimsResult = { data: { claims: null }, error: { message: 'no session' } };
    const req = makeRequest('/pricing');
    const res = await updateSession(req);
    expect(res.status).not.toBe(307);
  });

  it('usuário autenticado acessando /login é redirecionado pro dashboard', async () => {
    getClaimsResult = { data: { claims: { sub: 'user-1' } }, error: null };
    const req = makeRequest('/login', { cookies: { 'sb-project-auth-token': 'valido' } });
    const res = await updateSession(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/dashboard');
  });

  it('usuário não autenticado acessando /dashboard é redirecionado pro login', async () => {
    getClaimsResult = { data: { claims: null }, error: { message: 'no session' } };
    const req = makeRequest('/dashboard');
    const res = await updateSession(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('cookies renovados presentes mesmo quando a resposta é um redirect (não só no fluxo normal)', async () => {
    // Regressão específica: um redirect (NextResponse.redirect) é uma
    // response NOVA por natureza — se o código esquecer de copiar os
    // cookies do setAll pra ela, a renovação de sessão se perde
    // silenciosamente sempre que o middleware também precisa redirecionar.
    getClaimsResult = { data: { claims: { sub: 'user-1' } }, error: null };
    cookiesToSetOnRefresh = [
      { name: 'sb-project-auth-token', value: 'renovado-durante-redirect', options: { path: '/' } },
    ];
    const req = makeRequest('/login', { cookies: { 'sb-project-auth-token': 'antigo' } });
    const res = await updateSession(req);
    expect(res.status).toBe(307); // autenticado em /login → redireciona pro dashboard
    expect(res.cookies.get('sb-project-auth-token')?.value).toBe('renovado-durante-redirect');
  });

  it('duas contas diferentes no mesmo navegador (logout/login): cada chamada é isolada, sem vazar claims da anterior', async () => {
    getClaimsResult = { data: { claims: { sub: 'user-a' } }, error: null };
    const reqA = makeRequest('/dashboard', { cookies: { 'sb-project-auth-token': 'sessao-a' } });
    const resA = await updateSession(reqA);
    expect(resA.status).not.toBe(307);

    // Logout + login de outra conta: cookie trocado, novo claims mockado.
    getClaimsResult = { data: { claims: { sub: 'user-b' } }, error: null };
    const reqB = makeRequest('/dashboard', { cookies: { 'sb-project-auth-token': 'sessao-b' } });
    const resB = await updateSession(reqB);
    expect(resB.status).not.toBe(307);

    // Nenhuma das duas respostas herda estado da outra: cada updateSession()
    // cria seu próprio client a partir só dos cookies da própria request.
    expect(reqA.cookies.get('sb-project-auth-token')?.value).toBe('sessao-a');
    expect(reqB.cookies.get('sb-project-auth-token')?.value).toBe('sessao-b');
  });
});

describe('updateSession — headers maliciosos de middleware não contornam autenticação', () => {
  it('headers forjados (x-middleware-subrequest, Authorization, x-user-id, x-pathname) não substituem uma sessão inválida', async () => {
    getClaimsResult = { data: { claims: null }, error: { message: 'no session' } };
    const req = makeRequest('/dashboard', {
      headers: {
        'x-middleware-subrequest': 'middleware',
        authorization: 'Bearer forjado-nao-verificado',
        'x-user-id': 'admin',
        'x-supabase-authenticated': 'true',
        'x-pathname': '/pricing',
      },
    });
    const res = await updateSession(req);
    expect(res.status).toBe(307);
    expect(res.headers.get('location')).toContain('/login');
  });

  it('o x-pathname forjado pelo cliente é sobrescrito pelo pathname real da URL antes de chegar no Server Component', async () => {
    getClaimsResult = { data: { claims: { sub: 'user-1' } }, error: null };
    const req = makeRequest('/dashboard', {
      headers: { 'x-pathname': '/account' },
    });
    const res = await updateSession(req);
    const forwardedPathname = res.headers.get('x-middleware-request-x-pathname');
    expect(forwardedPathname).toBe('/dashboard');
  });
});

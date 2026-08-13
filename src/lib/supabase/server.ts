import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { cache } from 'react';

const SESSION_MAX_AGE = 60 * 60 * 24 * 30; // 30 dias

export function createClient() {
  const cookieStore = cookies();

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet: { name: string; value: string; options?: object }[]) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, { maxAge: SESSION_MAX_AGE, ...options as object })
            );
          } catch {
            // Server Component context: ignore
          }
        },
      },
    }
  );
}

/**
 * CONFIRMADO: (app)/layout.tsx e cada página server-side dentro dele
 * (ex: dashboard) chamavam supabase.auth.getUser() separadamente — duas
 * chamadas de rede pra API de Auth do Supabase na MESMA requisição,
 * verificando exatamente a mesma coisa. Sob uso intenso isso ajuda a
 * estourar o rate limit de autenticação do projeto mais rápido do que
 * precisaria.
 *
 * react.cache() memoiza por requisição (não entre requisições
 * diferentes, não é um cache de sessão) — chamar getCachedUser() do
 * layout e de novo da página dentro da mesma renderização só dispara
 * a chamada real ao Supabase uma vez; a segunda chamada reaproveita o
 * resultado já resolvido.
 */
export const getCachedUser = cache(async () => {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
});

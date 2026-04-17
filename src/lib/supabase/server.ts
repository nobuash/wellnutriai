import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

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

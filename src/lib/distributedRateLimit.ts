import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Rate limit distribuído (Postgres), ao contrário de src/lib/ratelimit.ts
 * (em memória, por instância). Use para endpoints sensíveis que precisam
 * de proteção real em produção com múltiplas instâncias — hoje: criação
 * de cobrança (subscribe/pix/card). Em caso de falha na checagem,
 * bloqueia por padrão (fail closed) em vez de deixar passar.
 */
export async function checkDistributedRateLimit(
  supabase: SupabaseClient,
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('check_rate_limit', {
    p_key: key,
    p_max: max,
    p_window_seconds: windowSeconds,
  });

  if (error) {
    console.error('[distributedRateLimit] falha ao checar, bloqueando por segurança:', error);
    return false;
  }

  return data === true;
}

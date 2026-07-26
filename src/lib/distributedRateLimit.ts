import { createServiceClient } from '@/lib/supabase/service';

/**
 * Rate limit distribuído (Postgres), ao contrário de src/lib/ratelimit.ts
 * (em memória, por instância). Use para endpoints sensíveis que precisam
 * de proteção real em produção com múltiplas instâncias — hoje: criação
 * de cobrança (subscribe/pix/card).
 *
 * A RPC check_rate_limit só é executável por service_role (ver
 * 013_lock_down_security_definer_rpcs.sql) — um usuário autenticado
 * não pode mais chamá-la direto do client SDK com uma p_key/p_max
 * arbitrários (o que antes permitia burlar o limite de outro usuário
 * ou inflar o contador de outra pessoa). Por isso este helper sempre
 * usa o service client, nunca o client do usuário.
 *
 * Em caso de falha na checagem, bloqueia por padrão (fail closed) em
 * vez de deixar passar.
 */
export async function checkDistributedRateLimit(
  key: string,
  max: number,
  windowSeconds: number,
): Promise<boolean> {
  try {
    const service = createServiceClient();
    const { data, error } = await service.rpc('check_rate_limit', {
      p_key: key,
      p_max: max,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error('[distributedRateLimit] falha ao checar, bloqueando por segurança:', error);
      return false;
    }

    return data === true;
  } catch (err) {
    console.error('[distributedRateLimit] erro inesperado, bloqueando por segurança:', err);
    return false;
  }
}

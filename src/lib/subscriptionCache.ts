import type { createServiceClient } from '@/lib/supabase/service';

/**
 * profiles.plan é só cache visual (a fonte da verdade é
 * src/lib/entitlement.ts, que sempre relê subscriptions). Depois de
 * qualquer mudança de assinatura — de qualquer provedor — recalcula a
 * partir de TODAS as assinaturas do usuário, não só a que acabou de
 * mudar, pra nunca rebaixar alguém que ainda tem outra assinatura
 * ativa de outro provedor (ex: Stripe ativa + PIX que acabou de
 * expirar não pode virar "free").
 */
export async function recalculateVisualPlanCache(
  service: ReturnType<typeof createServiceClient>,
  userId: string,
): Promise<void> {
  const { data: rows } = await service
    .from('subscriptions')
    .select('status, current_period_end')
    .eq('user_id', userId);

  const hasActive = (rows ?? []).some((r) => {
    if (r.status !== 'active') return false;
    if (!r.current_period_end) return true;
    return new Date(r.current_period_end).getTime() >= Date.now();
  });

  await service.from('profiles').update({ plan: hasActive ? 'pro' : 'free' }).eq('id', userId);
}

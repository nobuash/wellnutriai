import { getStripe } from '@/lib/stripe/client';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  password: z.string().min(1),
});

/**
 * Exclusão de conta. Ordem pensada para não deixar arquivos/recursos
 * órfãos:
 * 1. Confirma a senha atual (autenticação recente).
 * 2. Cancela assinatura recorrente real, se houver (best-effort).
 * 3. Apaga os objetos do usuário no Storage.
 * 4. Apaga o usuário no Supabase Auth — isso dispara ON DELETE CASCADE
 *    em todas as tabelas com FK para auth.users (profiles,
 *    questionnaires, meal_plans, chat_messages, meal_photo_analysis,
 *    subscriptions, calorie_logs, water_logs, usage_counters,
 *    user_consents), então não precisamos apagar cada tabela na mão.
 *    audit_log e ai_usage_logs usam ON DELETE SET NULL de propósito —
 *    o registro fica, anonimizado.
 * 5. Registra o evento em audit_log antes do passo 4 (para não perder
 *    o rastro do "quem", mesmo que o campo vire NULL logo em seguida).
 */
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user || !user.email) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Informe sua senha para confirmar' }, { status: 400 });
  }

  // Confirma autenticação recente reautenticando com a senha informada.
  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.password,
  });
  if (reauthError) {
    return NextResponse.json({ error: 'Senha incorreta' }, { status: 403 });
  }

  const service = createServiceClient();

  // Cancela assinatura Stripe recorrente, se houver — best-effort, não
  // bloqueia a exclusão se falhar (usuário quer apagar a conta mesmo assim).
  try {
    const { data: sub } = await service
      .from('subscriptions')
      .select('provider, provider_subscription_id, status')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (sub?.provider === 'stripe' && sub.status === 'active' && sub.provider_subscription_id) {
      await getStripe().subscriptions.cancel(sub.provider_subscription_id);
    }
  } catch (err) {
    console.error('[account/delete] falha ao cancelar assinatura (prosseguindo mesmo assim):', err);
  }

  // Apaga objetos do Storage — CASCADE do Postgres não alcança o Storage.
  try {
    const { data: files } = await service.storage.from('meal-photos').list(user.id, { limit: 1000 });
    if (files && files.length > 0) {
      const paths = files.map((f) => `${user.id}/${f.name}`);
      await service.storage.from('meal-photos').remove(paths);
    }
  } catch (err) {
    console.error('[account/delete] falha ao limpar Storage (prosseguindo mesmo assim):', err);
  }

  await service.from('audit_log').insert({
    user_id: user.id,
    action: 'account_deleted',
    metadata: {},
  });

  const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('[account/delete] falha ao apagar usuário:', deleteError);
    return NextResponse.json({ error: 'Não foi possível excluir a conta. Contate o suporte.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}

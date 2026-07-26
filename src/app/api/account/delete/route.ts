import { getStripe } from '@/lib/stripe/client';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  password: z.string().min(1),
});

const STORAGE_PAGE_SIZE = 1000;

/**
 * Exclusão de conta. Ordem pensada para não deixar arquivos/recursos
 * órfãos, nem cobrança recorrente ativa sobrevivendo à exclusão:
 *
 * 1. Confirma a senha atual (autenticação recente).
 * 2. Registra a solicitação em account_deletion_requests — se algo
 *    falhar no meio do caminho, fica um rastro retomável em vez de um
 *    estado indefinido.
 * 3. Cancela TODAS as assinaturas Stripe recorrentes ativas do
 *    usuário (não só a mais recente). Se qualquer cancelamento
 *    falhar, PARA aqui — a conta não é apagada enquanto a Stripe ainda
 *    puder cobrar alguém que não existe mais.
 * 4. Apaga os objetos do usuário no Storage, paginando (Postgres
 *    CASCADE não alcança o Storage) — não limitado silenciosamente a
 *    1000 arquivos, e falhas de list/remove são logadas em vez de
 *    ignoradas (não bloqueiam a exclusão em si, que é uma decisão
 *    diferente de "a cobrança ainda está ativa").
 * 5. Apaga o usuário no Supabase Auth — dispara ON DELETE CASCADE em
 *    profiles, questionnaires, meal_plans, chat_messages,
 *    meal_photo_analysis, subscriptions, calorie_logs, water_logs,
 *    usage_counters, user_consents e account_deletion_requests.
 *    audit_log/ai_usage_logs usam ON DELETE SET NULL de propósito.
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

  const { data: deletionRequest } = await service
    .from('account_deletion_requests')
    .insert({ user_id: user.id, status: 'pending' })
    .select('id')
    .single();
  const requestId = deletionRequest?.id as string | undefined;

  async function markRequest(status: string, lastError?: string) {
    if (!requestId) return;
    await service
      .from('account_deletion_requests')
      .update({ status, last_error: lastError ?? null, processed_at: status === 'completed' || status === 'failed' ? new Date().toISOString() : null })
      .eq('id', requestId);
  }

  // Passo 1: cancela TODAS as assinaturas Stripe recorrentes ativas —
  // não só a mais recente.
  await markRequest('canceling_subscriptions');

  const { data: activeSubs } = await service
    .from('subscriptions')
    .select('id, provider_subscription_id')
    .eq('user_id', user.id)
    .eq('provider', 'stripe')
    .eq('status', 'active')
    .eq('payment_type', 'subscription');

  if (activeSubs && activeSubs.length > 0) {
    const stripe = getStripe();
    for (const sub of activeSubs) {
      if (!sub.provider_subscription_id) continue;
      try {
        await stripe.subscriptions.cancel(sub.provider_subscription_id);
        await service.from('subscriptions').update({ status: 'canceled', canceled_at: new Date().toISOString() }).eq('id', sub.id);
      } catch (err) {
        const message = `Falha ao cancelar assinatura Stripe antes de excluir a conta: ${(err as Error).message}`;
        console.error('[account/delete]', message);
        await markRequest('failed', message);
        return NextResponse.json(
          {
            error:
              'Não foi possível cancelar sua assinatura ativa junto ao provedor de pagamento. ' +
              'Sua conta NÃO foi excluída para evitar que você continue sendo cobrado sem acesso. ' +
              'Tente novamente em alguns minutos ou contate o suporte.',
          },
          { status: 502 },
        );
      }
    }
  }

  // Passo 2: apaga objetos do Storage, paginando de verdade (sem
  // limite silencioso de 1000) e checando erros de list/remove.
  await markRequest('deleting_storage');
  const storageIssues: string[] = [];

  try {
    let offset = 0;
    for (;;) {
      const { data: files, error: listError } = await service.storage
        .from('meal-photos')
        .list(user.id, { limit: STORAGE_PAGE_SIZE, offset });

      if (listError) {
        storageIssues.push(`list offset=${offset}: ${listError.message}`);
        break;
      }
      if (!files || files.length === 0) break;

      const paths = files.map((f) => `${user.id}/${f.name}`);
      const { error: removeError } = await service.storage.from('meal-photos').remove(paths);
      if (removeError) {
        storageIssues.push(`remove offset=${offset}: ${removeError.message}`);
      }

      if (files.length < STORAGE_PAGE_SIZE) break;
      offset += STORAGE_PAGE_SIZE;
    }
  } catch (err) {
    storageIssues.push(String((err as Error)?.message ?? err));
  }

  if (storageIssues.length > 0) {
    // Não bloqueia a exclusão (diferente de uma cobrança ainda ativa),
    // mas fica registrado — não é silenciosamente ignorado.
    console.error('[account/delete] problemas ao limpar Storage:', storageIssues.join(' | '));
  }

  // Passo 3: apaga o usuário — dispara os CASCADEs no banco.
  await markRequest('deleting_data');

  await service.from('audit_log').insert({
    user_id: user.id,
    action: 'account_deleted',
    metadata: storageIssues.length > 0 ? { storage_issues: storageIssues.length } : {},
  });

  const { error: deleteError } = await service.auth.admin.deleteUser(user.id);
  if (deleteError) {
    console.error('[account/delete] falha ao apagar usuário:', deleteError);
    await markRequest('failed', deleteError.message);
    return NextResponse.json({ error: 'Não foi possível excluir a conta. Contate o suporte.' }, { status: 500 });
  }

  await markRequest('completed');

  return NextResponse.json({ ok: true });
}

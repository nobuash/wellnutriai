import { getStripe } from '@/lib/stripe/client';
import { requireSupabaseSuccess } from '@/lib/supabaseErrors';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { isRecurringSubscriptionRow } from '@/lib/subscriptionTypes';
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

  // Não confia só em payment_type='subscription' (já foi gravado
  // errado uma vez para assinaturas Stripe — ver
  // src/lib/subscriptionTypes.ts e migration 021). Busca todas as
  // linhas ativas do Stripe e filtra em código com a mesma defesa em
  // profundidade usada no cancelamento.
  const { data: activeStripeRows } = await service
    .from('subscriptions')
    .select('id, provider, provider_subscription_id, payment_type')
    .eq('user_id', user.id)
    .eq('provider', 'stripe')
    .eq('status', 'active');

  const activeSubs = (activeStripeRows ?? []).filter(isRecurringSubscriptionRow);

  if (activeSubs.length > 0) {
    const stripe = getStripe();
    for (const sub of activeSubs) {
      if (!sub.provider_subscription_id) continue;
      try {
        await stripe.subscriptions.cancel(sub.provider_subscription_id);
        await requireSupabaseSuccess(service.from('subscriptions').update({ status: 'canceled', canceled_at: new Date().toISOString() }).eq('id', sub.id));
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
  //
  // BUG CONFIRMADO (round 3): a versão anterior incrementava `offset`
  // a cada página REMOVIDA. Como list() reflete o estado atual do
  // bucket, remover a primeira página de 1000 arquivos faz os itens
  // que estavam nas posições 1000-1999 descerem para 0-999 — pedir
  // offset=1000 na próxima volta pula exatamente esse lote, que nunca
  // é apagado. A partir de agora sempre lista a partir de offset:0,
  // porque os arquivos já removidos somem da listagem.
  await markRequest('deleting_storage');
  const storageIssues: string[] = [];

  try {
    for (;;) {
      const { data: files, error: listError } = await service.storage
        .from('meal-photos')
        .list(user.id, { limit: STORAGE_PAGE_SIZE, offset: 0 });

      if (listError) {
        storageIssues.push(`list: ${listError.message}`);
        break;
      }
      if (!files || files.length === 0) break;

      const paths = files.map((f) => `${user.id}/${f.name}`);
      const { error: removeError } = await service.storage.from('meal-photos').remove(paths);
      if (removeError) {
        // Não continua o loop se remove() está falhando — sem os
        // arquivos saírem da listagem, offset:0 repetiria a mesma
        // página pra sempre.
        storageIssues.push(`remove: ${removeError.message}`);
        break;
      }

      if (files.length < STORAGE_PAGE_SIZE) break;
    }
  } catch (err) {
    storageIssues.push(String((err as Error)?.message ?? err));
  }

  if (storageIssues.length > 0) {
    // BLOQUEIA a exclusão (round 3): deixar fotos órfãs no Storage
    // enquanto a conta e todos os outros dados somem é uma promessa de
    // retenção de dados quebrada — o usuário acha que apagou tudo, mas
    // as imagens continuam lá. Mesmo tratamento que falha de
    // cancelamento de assinatura: para aqui, fica retomável.
    const message = storageIssues.join(' | ');
    console.error('[account/delete] problemas ao limpar Storage — exclusão NÃO concluída:', message);
    await markRequest('failed', `storage: ${message}`);
    return NextResponse.json(
      {
        error:
          'Não foi possível remover todos os seus arquivos armazenados. ' +
          'Sua conta NÃO foi excluída para não deixar dados órfãos. ' +
          'Tente novamente em alguns minutos ou contate o suporte.',
      },
      { status: 502 },
    );
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

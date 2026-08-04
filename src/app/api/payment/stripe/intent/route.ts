import { getStripe, getStripePriceId, STRIPE_INTERVALS } from '@/lib/stripe/client';
import { type PlanInterval } from '@/lib/mercadopago/client';
import { checkDistributedRateLimit } from '@/lib/distributedRateLimit';
import { consentReasonMessage, requireCurrentConsent } from '@/lib/consentCheck';
import { findActiveStripeSubscription, findStripeCustomerId } from '@/lib/stripe/activateSubscription';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logSupabaseWriteFailure } from '@/lib/supabaseErrors';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Janela para o usuário concluir o checkout antes da reserva expirar e
// liberar uma nova tentativa. Não precisa ser exata — só precisa ser
// curta o bastante pra não travar alguém que desistiu, e longa o
// bastante pra não expirar no meio de um checkout legítimo em
// andamento.
const RESERVATION_TTL_MINUTES = 15;

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Rate limit distribuído: 10 tentativas por hora por usuário
  if (!(await checkDistributedRateLimit(`payment-stripe-intent:${user.id}`, 10, 3600))) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente em breve.' }, { status: 429 });
  }

  const consent = await requireCurrentConsent(supabase, user.id);
  if (!consent.ok) {
    return NextResponse.json({ error: consentReasonMessage(consent.reason!) }, { status: 403 });
  }

  const { planInterval = 'monthly' } = await req.json().catch(() => ({})) as { planInterval?: PlanInterval };
  if (!STRIPE_INTERVALS[planInterval]) return NextResponse.json({ error: 'Plano inválido' }, { status: 400 });

  // Impede duas assinaturas recorrentes simultâneas — checagem inicial
  // (não atômica sozinha, ver reserva abaixo para a defesa real contra
  // concorrência).
  const existingSub = await findActiveStripeSubscription(user.id);
  if (existingSub) {
    return NextResponse.json(
      {
        error: 'Você já possui uma assinatura recorrente ativa.',
        code: 'ACTIVE_SUBSCRIPTION_EXISTS',
        manageSubscription: true,
      },
      { status: 409 },
    );
  }

  const service = createServiceClient();

  // Reserva atômica: só uma linha 'reserved'/'session_created' por
  // (user_id, provider) pode existir por vez (índice único parcial em
  // 023_checkout_reservations.sql). Duplo clique ou duas abas — a
  // segunda requisição esbarra no índice, não cria uma segunda
  // Checkout Session.
  const { data: reservation, error: reserveError } = await service
    .from('checkout_reservations')
    .insert({
      user_id: user.id,
      provider: 'stripe',
      plan_interval: planInterval,
      status: 'reserved',
      idempotency_key: crypto.randomUUID(),
      expires_at: new Date(Date.now() + RESERVATION_TTL_MINUTES * 60_000).toISOString(),
    })
    .select('id, idempotency_key')
    .single();

  if (reserveError || !reservation) {
    // Conflito no índice único = já existe uma reserva em andamento
    // para este usuário. Decide o que fazer com base no estado dela em
    // vez de simplesmente rejeitar.
    const { data: existingReservation } = await service
      .from('checkout_reservations')
      .select('id, status, checkout_session_id, expires_at')
      .eq('user_id', user.id)
      .eq('provider', 'stripe')
      .in('status', ['reserved', 'session_created'])
      .maybeSingle();

    if (!existingReservation) {
      // Erro real (não foi conflito de índice) — não sabemos o estado.
      console.error('[stripe/intent] falha ao reservar checkout:', reserveError);
      return NextResponse.json({ error: 'Erro ao iniciar pagamento. Tente novamente.' }, { status: 500 });
    }

    const isExpired = new Date(existingReservation.expires_at).getTime() < Date.now();
    if (isExpired) {
      // Reserva antiga nunca foi concluída — libera para uma nova
      // tentativa marcando como expirada, sem criar sessão nesta
      // chamada (evita duas gravações concorrentes na mesma janela;
      // o cliente tenta de novo e cai no caminho normal).
      const { error: expireError } = await service
        .from('checkout_reservations')
        .update({ status: 'expired' })
        .eq('id', existingReservation.id);
      // Não bloqueante: mesmo se a atualização falhar, ainda é seguro
      // pedir pro usuário tentar de novo (a pior consequência é a
      // reserva antiga continuar "reserved" até a próxima tentativa
      // tropeçar nela de novo e tentar expirar mais uma vez).
      logSupabaseWriteFailure('stripe-intent', expireError);
      return NextResponse.json(
        { error: 'Sua tentativa anterior expirou. Tente novamente.' },
        { status: 409 },
      );
    }

    if (existingReservation.checkout_session_id) {
      // Uma requisição concorrente já criou a sessão — devolve a MESMA,
      // não cria outra (retry idempotente do ponto de vista do usuário).
      try {
        const stripe = getStripe();
        const session = await stripe.checkout.sessions.retrieve(existingReservation.checkout_session_id);
        return NextResponse.json({ clientSecret: session.client_secret });
      } catch (err) {
        console.error('[stripe/intent] falha ao recuperar sessão existente:', err);
      }
    }

    return NextResponse.json(
      { error: 'Já existe uma tentativa de assinatura em andamento. Aguarde alguns segundos e tente novamente.' },
      { status: 409 },
    );
  }

  const email = user.email ?? `${user.id}@wellnutriai.app`;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'https://wellnutriai.com';

  try {
    const stripe = getStripe();

    // Reusa o provider_customer_id já conhecido em vez de localizar
    // por e-mail e pegar "o primeiro resultado" — ver
    // findStripeCustomerId em src/lib/stripe/activateSubscription.ts.
    const knownCustomerId = await findStripeCustomerId(user.id);
    let customerId: string;
    if (knownCustomerId) {
      customerId = knownCustomerId;
    } else {
      const existing = await stripe.customers.list({ email, limit: 1 });
      customerId = existing.data[0]?.id
        ?? (await stripe.customers.create({ email, metadata: { userId: user.id } })).id;
    }

    const priceId = getStripePriceId(planInterval);

    const session = await stripe.checkout.sessions.create(
      {
        // Verificado contra o SDK instalado (stripe@22.0.2): o tipo real
        // de ui_mode é 'elements' | 'embedded_page' | 'form' | 'hosted_page'
        // (nomenclatura desta API version), não 'hosted'|'embedded'|'custom'
        // como em versões/documentações mais antigas. 'embedded_page' já
        // era o valor certo — só removido o `as any` que escondia isso do
        // type-check sem necessidade.
        ui_mode: 'embedded_page',
        mode: 'subscription',
        customer: customerId,
        line_items: [{ price: priceId, quantity: 1 }],
        return_url: `${appUrl}/pricing?stripe_session={CHECKOUT_SESSION_ID}`,
        metadata: { userId: user.id, planInterval },
        subscription_data: { metadata: { userId: user.id, planInterval } },
      },
      // Chave de idempotência da própria Stripe: se esta exata chamada
      // for repetida (retry de rede, por exemplo), a Stripe devolve a
      // mesma sessão em vez de criar outra.
      { idempotencyKey: reservation.idempotency_key },
    );

    if (!session.client_secret) {
      // Sessão foi criada mas sem client_secret — o Embedded Checkout
      // do frontend não tem como funcionar sem isso. Trata como falha
      // (libera a reserva) em vez de devolver um clientSecret nulo que
      // quebraria silenciosamente no cliente.
      console.error(`[stripe/intent] sessão ${session.id} criada sem client_secret`);
      const { error: failError } = await service
        .from('checkout_reservations')
        .update({ status: 'failed' })
        .eq('id', reservation.id);
      logSupabaseWriteFailure('stripe-intent', failError);
      return NextResponse.json({ error: 'Erro ao criar sessão de pagamento. Tente novamente.' }, { status: 502 });
    }

    const { error: markCreatedError } = await service
      .from('checkout_reservations')
      .update({ status: 'session_created', checkout_session_id: session.id })
      .eq('id', reservation.id);
    // Não bloqueante: a sessão real já existe na Stripe e o
    // clientSecret já está pronto pra devolver — não vale a pena negar
    // o checkout ao usuário por causa de uma falha em registrar o
    // session_id localmente. Fica como alerta pra investigar; na pior
    // hipótese, uma segunda tentativa concorrente não vai encontrar
    // este reservation por checkout_session_id, mas o índice único por
    // (user_id, provider) continua protegendo contra duas sessões.
    logSupabaseWriteFailure('stripe-intent', markCreatedError);

    return NextResponse.json({ clientSecret: session.client_secret });
  } catch (err: unknown) {
    // Reserva não pode ficar "reserved" para sempre em caso de erro —
    // libera pra uma nova tentativa.
    const { error: failError } = await service.from('checkout_reservations').update({ status: 'failed' }).eq('id', reservation.id);
    logSupabaseWriteFailure('stripe-intent', failError);
    const stripeErr = err as { message?: string; code?: string };
    console.error('[stripe/intent] error:', stripeErr?.message, stripeErr?.code);
    return NextResponse.json({ error: stripeErr?.message ?? 'Erro ao criar sessão de pagamento' }, { status: 500 });
  }
}

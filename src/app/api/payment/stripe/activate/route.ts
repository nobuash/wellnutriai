import { getStripe } from '@/lib/stripe/client';
import { PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { createClient } from '@/lib/supabase/server';
import { createClient as createServiceClient } from '@supabase/supabase-js';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function getServiceSupabase() {
  return createServiceClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
}

export async function POST(req: Request) {
  // Auth check via cookie client
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { payment_intent_id } = await req.json().catch(() => ({})) as { payment_intent_id?: string };
  if (!payment_intent_id) return NextResponse.json({ error: 'payment_intent_id obrigatório' }, { status: 400 });

  try {
    const stripe = getStripe();
    const intent = await stripe.paymentIntents.retrieve(payment_intent_id);

    if (intent.metadata?.userId !== user.id) {
      return NextResponse.json({ error: 'Pagamento não pertence a este usuário' }, { status: 403 });
    }

    if (intent.status !== 'succeeded') {
      return NextResponse.json({ status: intent.status, activated: false });
    }

    const planInterval = (intent.metadata?.planInterval ?? 'monthly') as PlanInterval;
    const plan = PLANS[planInterval];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + plan.durationDays);

    // Use service role to bypass RLS
    const db = getServiceSupabase();

    const { error: subError } = await db.from('subscriptions').upsert(
      {
        user_id: user.id,
        plan: 'pro',
        mp_subscription_id: payment_intent_id,
        mp_status: 'authorized',
        payment_type: 'card',
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: 'mp_subscription_id' }
    );
    if (subError) {
      console.error('[stripe/activate] subscriptions error:', subError);
      return NextResponse.json({ error: 'Erro ao salvar assinatura' }, { status: 500 });
    }

    const { error: profileError } = await db.from('profiles').update({ plan: 'pro' }).eq('id', user.id);
    if (profileError) {
      console.error('[stripe/activate] profiles error:', profileError);
      return NextResponse.json({ error: 'Erro ao atualizar perfil' }, { status: 500 });
    }

    console.log(`[stripe/activate] user=${user.id} ativado PRO via Stripe, expira ${expiresAt.toISOString()}`);
    return NextResponse.json({ status: 'succeeded', activated: true });
  } catch (err) {
    console.error('[stripe/activate] error:', err);
    return NextResponse.json({ error: 'Erro ao ativar plano' }, { status: 500 });
  }
}

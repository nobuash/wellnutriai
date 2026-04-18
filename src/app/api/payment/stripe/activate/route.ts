import { getStripe } from '@/lib/stripe/client';
import { type PlanInterval } from '@/lib/mercadopago/client';
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

const PLAN_DAYS: Record<PlanInterval, number> = {
  monthly: 30,
  quarterly: 90,
  annual: 365,
};

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { subscription_id } = await req.json().catch(() => ({})) as { subscription_id?: string };
  if (!subscription_id) return NextResponse.json({ error: 'subscription_id obrigatório' }, { status: 400 });

  try {
    const stripe = getStripe();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sub = await (stripe.subscriptions.retrieve as any)(subscription_id, {
      expand: ['latest_invoice.payment_intent'],
    });

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = sub.metadata as any;
    if (meta?.userId !== user.id) {
      return NextResponse.json({ error: 'Assinatura não pertence a este usuário' }, { status: 403 });
    }

    // Verifica se o pagamento da primeira fatura foi aprovado
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const paymentIntentStatus = (sub.latest_invoice as any)?.payment_intent?.status as string | undefined;
    const subStatus = sub.status as string;

    console.log(`[stripe/activate] sub=${subscription_id} status=${subStatus} pi_status=${paymentIntentStatus}`);

    const paymentOk = subStatus === 'active'
      || subStatus === 'trialing'
      || paymentIntentStatus === 'succeeded';

    if (!paymentOk) {
      return NextResponse.json({ status: subStatus, activated: false });
    }

    const planInterval = (meta?.planInterval ?? 'monthly') as PlanInterval;
    const days = PLAN_DAYS[planInterval];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);

    const db = getServiceSupabase();

    const { error: subError } = await db.from('subscriptions').upsert(
      {
        user_id: user.id,
        plan: 'pro',
        mp_subscription_id: subscription_id,
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

    console.log(`[stripe/activate] user=${user.id} ativado PRO sub=${subscription_id} expira=${expiresAt.toISOString()}`);
    return NextResponse.json({ status: 'active', activated: true });
  } catch (err) {
    console.error('[stripe/activate] error:', err);
    return NextResponse.json({ error: 'Erro ao ativar plano' }, { status: 500 });
  }
}

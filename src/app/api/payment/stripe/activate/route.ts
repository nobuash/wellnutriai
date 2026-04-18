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

  const { session_id } = await req.json().catch(() => ({})) as { session_id?: string };
  if (!session_id) return NextResponse.json({ error: 'session_id obrigatório' }, { status: 400 });

  try {
    const stripe = getStripe();
    const session = await stripe.checkout.sessions.retrieve(session_id);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const meta = session.metadata as any;
    if (meta?.userId !== user.id) {
      return NextResponse.json({ error: 'Sessão não pertence a este usuário' }, { status: 403 });
    }

    if (session.status !== 'complete') {
      return NextResponse.json({ status: session.status, activated: false });
    }

    const planInterval = (meta?.planInterval ?? 'monthly') as PlanInterval;
    const days = PLAN_DAYS[planInterval];
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + days);
    const subscriptionId = session.subscription as string ?? session_id;

    const db = getServiceSupabase();

    const { error: subError } = await db.from('subscriptions').upsert(
      {
        user_id: user.id,
        plan: 'pro',
        mp_subscription_id: subscriptionId,
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

    console.log(`[stripe/activate] user=${user.id} ativado PRO sub=${subscriptionId} expira=${expiresAt.toISOString()}`);
    return NextResponse.json({ status: 'complete', activated: true });
  } catch (err) {
    console.error('[stripe/activate] error:', err);
    return NextResponse.json({ error: 'Erro ao ativar plano' }, { status: 500 });
  }
}

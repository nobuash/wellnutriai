import { getStripe } from '@/lib/stripe/client';
import { activateStripeSubscription } from '@/lib/stripe/activateSubscription';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Chamado pelo frontend depois que o checkout embutido da Stripe
// fecha. Repetir esta chamada com o mesmo session_id é seguro por
// construção: activateStripeSubscription sempre busca o estado real
// da assinatura na Stripe e usa as datas de período que a própria
// Stripe calculou, nunca Date.now() — reprocessar sem uma renovação
// real dá sempre o mesmo resultado.
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

    if (session.mode !== 'subscription') {
      return NextResponse.json({ error: 'Sessão não é uma assinatura' }, { status: 400 });
    }

    if (session.status !== 'complete') {
      return NextResponse.json({ status: session.status, activated: false });
    }

    const subscriptionId = session.subscription as string | null;
    if (!subscriptionId) {
      return NextResponse.json({ error: 'Sessão sem assinatura associada' }, { status: 400 });
    }

    const result = await activateStripeSubscription(subscriptionId, user.id);

    if (result.outcome === 'ownership_mismatch') {
      return NextResponse.json({ error: 'Assinatura não pertence a este usuário' }, { status: 403 });
    }
    if (result.outcome === 'inactive') {
      return NextResponse.json({ status: result.status, activated: false });
    }

    console.log(`[stripe/activate] user=${user.id} ativado PRO sub=${subscriptionId} expira=${result.periodEnd}`);
    return NextResponse.json({ status: 'complete', activated: true, periodEnd: result.periodEnd });
  } catch (err) {
    console.error('[stripe/activate] error:', err);
    return NextResponse.json({ error: 'Erro ao ativar plano' }, { status: 500 });
  }
}

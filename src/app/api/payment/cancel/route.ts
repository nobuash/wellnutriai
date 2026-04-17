import { getPreApproval } from '@/lib/mercadopago/client';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  // Busca assinatura ativa do usuário
  const { data: sub } = await supabase
    .from('subscriptions')
    .select('mp_subscription_id, mp_status')
    .eq('user_id', user.id)
    .eq('mp_status', 'authorized')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.mp_subscription_id) {
    return NextResponse.json(
      { error: 'Nenhuma assinatura ativa encontrada' },
      { status: 400 },
    );
  }

  try {
    // Cancela no Mercado Pago
    await getPreApproval().update({
      id: sub.mp_subscription_id,
      body: { status: 'cancelled' },
    });

    // Atualiza localmente (o webhook vai confirmar, mas atualizamos imediatamente)
    await supabase
      .from('subscriptions')
      .update({ mp_status: 'cancelled' })
      .eq('mp_subscription_id', sub.mp_subscription_id);

    await supabase
      .from('profiles')
      .update({ plan: 'free' })
      .eq('id', user.id);

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[payment/cancel] error:', err);
    return NextResponse.json(
      { error: 'Não foi possível cancelar a assinatura. Tente novamente.' },
      { status: 500 },
    );
  }
}

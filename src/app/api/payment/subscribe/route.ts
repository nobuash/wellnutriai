import { preApproval, PRO_PLAN } from '@/lib/mercadopago/client';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  // Busca email e plano atual
  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, email, name')
    .eq('id', user.id)
    .single();

  if (profile?.plan === 'pro') {
    return NextResponse.json({ error: 'Você já possui o plano PRO' }, { status: 400 });
  }

  // Verifica se já existe assinatura pendente/ativa para este usuário
  const { data: existingSub } = await supabase
    .from('subscriptions')
    .select('mp_subscription_id, mp_status')
    .eq('user_id', user.id)
    .in('mp_status', ['pending', 'authorized'])
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existingSub?.mp_subscription_id) {
    // Busca a URL de checkout existente no MP para evitar criar duplicatas
    try {
      const existing = await preApproval.get({ id: existingSub.mp_subscription_id });
      if (existing?.init_point) {
        return NextResponse.json({ init_point: existing.init_point });
      }
    } catch {
      // Se não encontrar, cria uma nova abaixo
    }
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  try {
    const result = await preApproval.create({
      body: {
        reason: PRO_PLAN.label,
        payer_email: profile?.email ?? user.email!,
        back_url: `${appUrl}/payment/success`,
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: PRO_PLAN.amount,
          currency_id: PRO_PLAN.currency,
        },
        // Armazena o user_id como referência externa para o webhook
        external_reference: user.id,
        status: 'pending',
      },
    });

    if (!result?.id || !result?.init_point) {
      throw new Error('Resposta inválida do Mercado Pago');
    }

    // Salva a assinatura pendente no banco
    await supabase.from('subscriptions').upsert(
      {
        user_id: user.id,
        plan: 'pro',
        mp_subscription_id: result.id,
        mp_status: 'pending',
      },
      { onConflict: 'mp_subscription_id' },
    );

    return NextResponse.json({ init_point: result.init_point });
  } catch (err) {
    console.error('[payment/subscribe] error:', err);
    return NextResponse.json(
      { error: 'Não foi possível iniciar o pagamento. Tente novamente.' },
      { status: 500 },
    );
  }
}

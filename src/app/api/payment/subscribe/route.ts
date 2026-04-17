import { getPreference, PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { planInterval?: string };
  const planInterval: PlanInterval =
    body.planInterval === 'quarterly' || body.planInterval === 'annual'
      ? body.planInterval
      : 'monthly';

  const plan = PLANS[planInterval];

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, email, name')
    .eq('id', user.id)
    .single();

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const fullName = profile?.name ?? 'Usuário';
  const nameParts = fullName.trim().split(' ');
  const firstName = nameParts[0] ?? 'Usuário';
  const lastName = nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'WellNutri';

  try {
    const result = await getPreference().create({
      body: {
        items: [
          {
            id: `pro-${planInterval}`,
            title: plan.label,
            quantity: 1,
            unit_price: plan.amount,
            currency_id: plan.currency,
          },
        ],
        payer: {
          email: profile?.email ?? user.email!,
          name: firstName,
          surname: lastName,
        },
        back_urls: {
          success: `${appUrl}/payment/success`,
          failure: `${appUrl}/payment/failure`,
          pending: `${appUrl}/payment/pending`,
        },
        auto_return: 'approved',
        external_reference: `${user.id}:${planInterval}`,
        notification_url: `${appUrl}/api/payment/webhook`,
      },
    });

    if (!result?.id || !result?.init_point) {
      throw new Error('Resposta inválida do Mercado Pago');
    }

    return NextResponse.json({ init_point: result.init_point });
  } catch (err) {
    console.error('[payment/subscribe] error:', err);
    return NextResponse.json(
      { error: 'Não foi possível iniciar o pagamento. Tente novamente.' },
      { status: 500 },
    );
  }
}

import { getPayment, PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

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
    const result = await getPayment().create({
      body: {
        transaction_amount: plan.amount,
        description: plan.label,
        payment_method_id: 'pix',
        payer: {
          email: profile?.email ?? user.email!,
          first_name: firstName,
          last_name: lastName,
        },
        // Encode planInterval in external_reference so webhook knows the duration
        external_reference: `${user.id}:${planInterval}`,
        notification_url: `${appUrl}/api/payment/webhook`,
      },
    });

    if (!result?.id) throw new Error('Resposta inválida do Mercado Pago');

    const qrCode = result.point_of_interaction?.transaction_data?.qr_code;
    const qrCodeBase64 = result.point_of_interaction?.transaction_data?.qr_code_base64;

    if (!qrCode) {
      console.error('[payment/pix] QR code ausente na resposta:', JSON.stringify(result));
      throw new Error('QR code não retornado pelo Mercado Pago');
    }

    await supabase.from('subscriptions').upsert(
      {
        user_id: user.id,
        plan: 'pro',
        mp_subscription_id: String(result.id),
        mp_status: 'pending',
        payment_type: 'pix',
      },
      { onConflict: 'mp_subscription_id' }
    );

    return NextResponse.json({ payment_id: result.id, qr_code: qrCode, qr_code_base64: qrCodeBase64 });
  } catch (err) {
    const cause = (err as { cause?: unknown })?.cause;
    console.error('[payment/pix] error:', err);
    if (cause) console.error('[payment/pix] cause:', JSON.stringify(cause));
    return NextResponse.json({ error: 'Não foi possível gerar o PIX. Tente novamente.' }, { status: 500 });
  }
}

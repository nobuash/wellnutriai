import { getPayment, PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { getAppUrl } from '@/lib/appUrl';
import { checkDistributedRateLimit } from '@/lib/distributedRateLimit';
import { consentReasonMessage, requireCurrentConsent } from '@/lib/consentCheck';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { requireSupabaseSuccess } from '@/lib/supabaseErrors';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Conta do Mercado Pago pode não estar habilitada pra receber
  // pagamentos ainda — o botão de PIX já fica oculto na UI nesse caso
  // (ver next.config.js / NEXT_PUBLIC_MERCADOPAGO_ENABLED), isso aqui é
  // só a mesma checagem no servidor pra quem chamar a rota direto.
  if (!process.env.MP_ACCESS_TOKEN) {
    return NextResponse.json({ error: 'Pagamento via PIX indisponível no momento.' }, { status: 503 });
  }

  // Rate limit distribuído: 10 tentativas de gerar PIX por hora por usuário
  if (!(await checkDistributedRateLimit(`payment-pix:${user.id}`, 10, 3600))) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente em breve.' }, { status: 429 });
  }

  const consent = await requireCurrentConsent(supabase, user.id);
  if (!consent.ok) {
    return NextResponse.json({ error: consentReasonMessage(consent.reason!) }, { status: 403 });
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

  const appUrl = getAppUrl();

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

    // subscriptions só aceita escrita via service_role (RLS) — ver
    // 007_normalize_subscriptions.sql.
    await requireSupabaseSuccess(createServiceClient().from('subscriptions').upsert(
      {
        user_id: user.id,
        plan: 'pro',
        mp_subscription_id: String(result.id),
        mp_status: 'pending',
        payment_type: 'pix',
        provider: 'mercadopago',
        provider_subscription_id: String(result.id),
        provider_payment_id: String(result.id),
        status: 'pending',
        billing_interval: planInterval,
      },
      { onConflict: 'mp_subscription_id' }
    ));

    return NextResponse.json({ payment_id: result.id, qr_code: qrCode, qr_code_base64: qrCodeBase64 });
  } catch (err) {
    const cause = (err as { cause?: unknown })?.cause;
    console.error('[payment/pix] error:', err);
    if (cause) console.error('[payment/pix] cause:', JSON.stringify(cause));
    return NextResponse.json({ error: 'Não foi possível gerar o PIX. Tente novamente.' }, { status: 500 });
  }
}

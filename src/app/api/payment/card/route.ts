import { getPayment, PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  token: z.string(),
  installments: z.number(),
  payment_method_id: z.string(),
  issuer_id: z.union([z.string(), z.number()]).optional(),
  payer: z.object({
    email: z.string().email(),
    first_name: z.string().optional(),
    last_name: z.string().optional(),
    identification: z.object({ type: z.string(), number: z.string() }).optional(),
  }),
  planInterval: z.enum(['monthly', 'quarterly', 'annual']).default('monthly'),
});

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const { token, installments, payment_method_id, issuer_id, payer, planInterval } = parsed.data;
  const plan = PLANS[planInterval as PlanInterval];
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000';

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, email')
    .eq('id', user.id)
    .single();

  const fullName = profile?.name ?? 'Usuário WellNutri';
  const nameParts = fullName.trim().split(' ');
  const firstName = payer.first_name ?? nameParts[0] ?? 'Usuário';
  const lastName = payer.last_name ?? (nameParts.length > 1 ? nameParts.slice(1).join(' ') : 'WellNutri');

  try {
    const result = await getPayment().create({
      body: {
        transaction_amount: plan.amount,
        token,
        description: plan.label,
        installments,
        payment_method_id,
        issuer_id: issuer_id ? Number(issuer_id) : undefined,
        payer: {
          email: payer.email,
          first_name: firstName,
          last_name: lastName,
          identification: payer.identification,
        },
        external_reference: `${user.id}:${planInterval}`,
        notification_url: `${appUrl}/api/payment/webhook`,
        three_d_secure_mode: 'optional',
        binary_mode: false,
        additional_info: {
          items: [
            {
              id: `wellnutriai-pro-${planInterval}`,
              title: plan.label,
              description: `Acesso PRO WellNutriAI — ${plan.displayLabel}`,
              quantity: 1,
              unit_price: plan.amount,
              category_id: 'services',
            },
          ],
          payer: {
            first_name: firstName,
            last_name: lastName,
            registration_date: new Date().toISOString(),
          },
        },
      },
    });

    if (!result?.id) throw new Error('Resposta inválida do Mercado Pago');

    const status = result.status;
    const statusDetail = result.status_detail ?? '';
    console.log(`[payment/card] status=${status} detail=${statusDetail} id=${result.id}`);

    if (status === 'approved') {
      const durationDays = plan.durationDays;
      const expiresAt = new Date();
      expiresAt.setDate(expiresAt.getDate() + durationDays);

      await supabase.from('subscriptions').upsert(
        {
          user_id: user.id,
          plan: 'pro',
          mp_subscription_id: String(result.id),
          mp_status: 'authorized',
          payment_type: 'card',
          expires_at: expiresAt.toISOString(),
        },
        { onConflict: 'mp_subscription_id' }
      );

      await supabase.from('profiles').update({ plan: 'pro' }).eq('id', user.id);
    }

    const rejectionMessages: Record<string, string> = {
      cc_rejected_bad_filled_security_code: 'Código de segurança (CVV) incorreto.',
      cc_rejected_bad_filled_date: 'Data de validade incorreta.',
      cc_rejected_bad_filled_other: 'Dados do cartão incorretos. Verifique e tente novamente.',
      cc_rejected_insufficient_amount: 'Saldo insuficiente no cartão.',
      cc_rejected_high_risk: 'Pagamento recusado pelo banco. Tente novamente ou use o PIX.',
      cc_rejected_call_for_authorize: 'Autorize o pagamento no app do seu banco e tente novamente.',
      cc_rejected_card_disabled: 'Cartão desativado para compras online. Contate seu banco.',
      cc_rejected_max_attempts: 'Muitas tentativas. Aguarde alguns minutos e tente novamente.',
      cc_rejected_duplicated_payment: 'Pagamento duplicado detectado.',
    };

    const userMessage = rejectionMessages[statusDetail]
      ?? (status !== 'approved' ? 'Pagamento não aprovado. Tente outro cartão ou use o PIX.' : null);

    const resultAny = result as unknown as Record<string, unknown>;
    const threedsUrl = resultAny?.three_ds_info
      ? (resultAny.three_ds_info as Record<string, string>)?.external_resource_url
      : null;

    return NextResponse.json({ status, statusDetail, payment_id: result.id, userMessage, threedsUrl });
  } catch (err) {
    const cause = (err as { cause?: unknown })?.cause;
    console.error('[payment/card] error:', err);
    if (cause) console.error('[payment/card] cause:', JSON.stringify(cause));
    return NextResponse.json({ error: 'Pagamento não processado. Verifique os dados e tente novamente.' }, { status: 500 });
  }
}

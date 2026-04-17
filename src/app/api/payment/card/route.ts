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
          identification: payer.identification,
        },
        external_reference: `${user.id}:${planInterval}`,
        notification_url: `${appUrl}/api/payment/webhook`,
      },
    });

    if (!result?.id) throw new Error('Resposta inválida do Mercado Pago');

    const status = result.status;

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

    return NextResponse.json({ status, payment_id: result.id });
  } catch (err) {
    const cause = (err as { cause?: unknown })?.cause;
    console.error('[payment/card] error:', err);
    if (cause) console.error('[payment/card] cause:', JSON.stringify(cause));
    return NextResponse.json({ error: 'Pagamento não processado. Verifique os dados e tente novamente.' }, { status: 500 });
  }
}

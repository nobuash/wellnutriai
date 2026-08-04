import { getPayment, PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { activateMpPayment } from '@/lib/mercadopago/activatePayment';
import { checkDistributedRateLimit } from '@/lib/distributedRateLimit';
import { consentReasonMessage, requireCurrentConsent } from '@/lib/consentCheck';
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

  // Rate limit distribuído: 10 tentativas de cobrança por hora por usuário
  if (!(await checkDistributedRateLimit(`payment-card:${user.id}`, 10, 3600))) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente em breve.' }, { status: 429 });
  }

  const consent = await requireCurrentConsent(supabase, user.id);
  if (!consent.ok) {
    return NextResponse.json({ error: consentReasonMessage(consent.reason!) }, { status: 403 });
  }

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
      // Fonte única de ativação do Mercado Pago (round 4): esta rota
      // NÃO calcula mais sua própria data de expiração. Antes,
      // card/route.ts, o webhook e /api/payment/verify tinham três
      // implementações divergentes; se a lógica de validação/expiração
      // mudasse num lugar (como o round 2 fez ao trocar Date.now() por
      // date_approved), os outros dois ficavam desatualizados sem
      // ninguém perceber. activateMpPayment() busca o pagamento de
      // novo na API do MP (nunca confia no `result` do create()),
      // valida dono/valor/moeda e usa date_approved do provedor.
      const activation = await activateMpPayment(Number(result.id), user.id);
      console.log(`[payment/card] ativação outcome=${activation.outcome}`);

      if (activation.outcome !== 'activated') {
        // Cobrança foi aprovada no MP mas a ativação recusou por outro
        // motivo (ex: valor não confere) — não deveria acontecer numa
        // cobrança que nós mesmos acabamos de criar com o valor certo,
        // mas se acontecer é mais seguro reportar erro do que fingir
        // sucesso.
        console.error(`[payment/card] cobrança approved mas ativação não completou: ${activation.outcome}`);
        return NextResponse.json(
          { error: 'Pagamento aprovado, mas houve um problema ao liberar seu acesso PRO. Contate o suporte com o ID: ' + result.id },
          { status: 502 },
        );
      }
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

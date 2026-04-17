import { getPayment, getPreApproval, PLANS, type PlanInterval } from '@/lib/mercadopago/client';
import { verifyMPSignature } from '@/lib/mercadopago/webhook';
import { createClient as createServerClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error('Supabase service role não configurado');
  return createServerClient(url, key);
}

export async function POST(req: NextRequest) {
  const xSignature = req.headers.get('x-signature') ?? '';
  const xRequestId = req.headers.get('x-request-id') ?? '';
  const body = await req.json().catch(() => ({})) as Record<string, unknown>;
  const dataId =
    (body?.data as Record<string, string> | undefined)?.id ??
    (req.nextUrl.searchParams.get('data.id') ?? '');

  if (xSignature && !verifyMPSignature(xSignature, xRequestId, dataId)) {
    console.warn('[webhook] Assinatura inválida');
    return NextResponse.json({ error: 'Assinatura inválida' }, { status: 401 });
  }

  const type = body?.type ?? req.nextUrl.searchParams.get('type');
  if (!dataId) return NextResponse.json({ error: 'ID ausente' }, { status: 400 });

  const supabase = getServiceClient();

  try {
    // PIX — pagamento único
    if (type === 'payment') {
      const payment = await getPayment().get({ id: Number(dataId) });
      if (!payment?.id || !payment.external_reference) return NextResponse.json({ ok: true });

      const externalRef = payment.external_reference as string;
      const [userId, rawInterval = 'monthly'] = externalRef.split(':');
      const planInterval: PlanInterval =
        rawInterval === 'quarterly' || rawInterval === 'annual' ? rawInterval : 'monthly';
      const status = payment.status as string; // approved | pending | rejected

      if (status === 'approved') {
        const durationDays = PLANS[planInterval].durationDays;
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + durationDays);

        await supabase.from('subscriptions').upsert(
          {
            user_id: userId,
            plan: 'pro',
            mp_subscription_id: String(payment.id),
            mp_status: 'authorized',
            payment_type: 'pix',
            expires_at: expiresAt.toISOString(),
          },
          { onConflict: 'mp_subscription_id' }
        );

        await supabase.from('profiles').update({ plan: 'pro' }).eq('id', userId);
        console.log(`[webhook/pix] user=${userId} aprovado, expira ${expiresAt.toISOString()}`);
      }

      return NextResponse.json({ ok: true });
    }

    // Assinatura recorrente (cartão)
    if (type === 'preapproval') {
      const sub = await getPreApproval().get({ id: String(dataId) });
      if (!sub?.id || !sub.external_reference) return NextResponse.json({ ok: true });

      const userId = sub.external_reference as string;
      const mpStatus = sub.status as string;
      const newPlan = mpStatus === 'authorized' ? 'pro' : 'free';

      await supabase.from('subscriptions').upsert(
        {
          user_id: userId,
          plan: newPlan,
          mp_subscription_id: sub.id,
          mp_status: mpStatus,
          next_payment_date: (sub.auto_recurring as Record<string, string> | undefined)?.end_date ?? null,
          payment_type: 'subscription',
        },
        { onConflict: 'mp_subscription_id' }
      );

      await supabase.from('profiles').update({ plan: newPlan }).eq('id', userId);
      console.log(`[webhook/subscription] user=${userId} status=${mpStatus} plan=${newPlan}`);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[webhook] error:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

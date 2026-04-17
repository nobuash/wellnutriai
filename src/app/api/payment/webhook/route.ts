import { getPreApproval } from '@/lib/mercadopago/client';
import { verifyMPSignature } from '@/lib/mercadopago/webhook';
import { createClient as createServerClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Usa service role para ignorar RLS — webhook não tem sessão de usuário
function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
  if (!url || !key) throw new Error('Supabase service role não configurado');
  return createServerClient(url, key);
}

export async function POST(req: NextRequest) {
  // 1. Verificação de assinatura
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

  // 2. Só processa notificações de assinatura (preapproval)
  if (type !== 'preapproval') {
    return NextResponse.json({ ok: true });
  }

  if (!dataId) {
    return NextResponse.json({ error: 'ID ausente' }, { status: 400 });
  }

  try {
    // 3. Busca os detalhes atualizados da assinatura no MP
    const sub = await getPreApproval().get({ id: String(dataId) });

    if (!sub?.id || !sub.external_reference) {
      return NextResponse.json({ error: 'Assinatura inválida' }, { status: 400 });
    }

    const userId = sub.external_reference as string;
    const mpStatus = sub.status as string; // authorized | cancelled | paused | pending
    const nextPaymentDate = (sub.auto_recurring as Record<string, string> | undefined)
      ?.end_date ?? null;

    const supabase = getServiceClient();

    // 4. Atualiza o registro da assinatura
    await supabase
      .from('subscriptions')
      .upsert(
        {
          user_id: userId,
          plan: mpStatus === 'authorized' ? 'pro' : 'free',
          mp_subscription_id: sub.id,
          mp_status: mpStatus,
          next_payment_date: nextPaymentDate,
        },
        { onConflict: 'mp_subscription_id' },
      );

    // 5. Atualiza o plano no perfil do usuário
    const newPlan = mpStatus === 'authorized' ? 'pro' : 'free';

    await supabase
      .from('profiles')
      .update({ plan: newPlan })
      .eq('id', userId);

    console.log(`[webhook] user=${userId} status=${mpStatus} plan=${newPlan}`);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error('[webhook] error:', err);
    return NextResponse.json({ error: 'Erro interno' }, { status: 500 });
  }
}

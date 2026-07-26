import { activateMpPayment } from '@/lib/mercadopago/activatePayment';
import { checkDistributedRateLimit } from '@/lib/distributedRateLimit';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Endpoint para o usuário verificar manualmente se o pagamento foi aprovado
// e ativar o plano caso o webhook não tenha disparado. Chamar isto
// repetidamente com o mesmo payment_id é seguro por construção —
// activateMpPayment calcula a expiração a partir de date_approved (data
// real do provedor), então o resultado é sempre o mesmo, nunca estende
// a validade a cada nova chamada.
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Rate limit distribuído. A UI já faz polling automático a cada 5s
  // por até 30min enquanto o modal do PIX está aberto (~360 chamadas),
  // então o limite precisa folgar bastante acima disso.
  if (!(await checkDistributedRateLimit(`payment-verify:${user.id}`, 500, 3600))) {
    return NextResponse.json({ error: 'Muitas tentativas. Tente novamente em breve.' }, { status: 429 });
  }

  const { payment_id } = await req.json().catch(() => ({})) as { payment_id?: number };
  if (!payment_id) return NextResponse.json({ error: 'payment_id obrigatório' }, { status: 400 });

  try {
    const result = await activateMpPayment(Number(payment_id), user.id);

    switch (result.outcome) {
      case 'activated':
        console.log(`[verify] user=${user.id} plano ativado, expira ${result.expiresAt}`);
        return NextResponse.json({ status: 'approved', activated: true, expiresAt: result.expiresAt });
      case 'not_approved':
        return NextResponse.json({ status: result.status, activated: false, message: 'Pagamento ainda não aprovado' });
      case 'ownership_mismatch':
        return NextResponse.json({ error: 'Pagamento não pertence a este usuário' }, { status: 403 });
      case 'amount_mismatch':
        return NextResponse.json({ error: 'Valor do pagamento não confere com o plano' }, { status: 400 });
      case 'revoked':
        return NextResponse.json({ status: 'revoked', activated: false, message: 'Pagamento não está mais aprovado' });
    }
  } catch (err) {
    console.error('[verify] error:', err);
    return NextResponse.json({ error: 'Erro ao verificar pagamento' }, { status: 500 });
  }
}

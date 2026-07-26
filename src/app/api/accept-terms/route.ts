import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/consent';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import crypto from 'crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function hashIp(ip: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'wellnutriai';
  return crypto.createHmac('sha256', secret).update(ip).digest('hex');
}

export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const acceptedAt = new Date().toISOString();
  const userAgent = req.headers.get('user-agent') ?? null;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  // Grava com service_role: o trigger protect_plan_column só permite
  // escrever accepted_terms_at quando a conexão é service_role — é
  // proposital, é o servidor (após validar a sessão do usuário acima)
  // quem registra o aceite, nunca o cliente diretamente.
  const service = createServiceClient();

  const { error } = await service
    .from('profiles')
    .update({
      accepted_terms: true,
      accepted_terms_at: acceptedAt,
      terms_version: TERMS_VERSION,
      privacy_version: PRIVACY_VERSION,
    })
    .eq('id', user.id);

  if (error) {
    console.error('[accept-terms] erro ao atualizar profile:', error);
    return NextResponse.json({ error: 'Erro ao registrar aceite' }, { status: 500 });
  }

  const { error: consentError } = await service.from('user_consents').insert({
    user_id: user.id,
    terms_version: TERMS_VERSION,
    privacy_version: PRIVACY_VERSION,
    accepted_at: acceptedAt,
    user_agent: userAgent,
    ip_hash: ip ? hashIp(ip) : null,
  });

  if (consentError) {
    // Não bloqueia o fluxo do usuário por causa do log de auditoria,
    // mas registra o erro para investigação.
    console.error('[accept-terms] erro ao gravar user_consents:', consentError);
  }

  return NextResponse.json({ ok: true });
}

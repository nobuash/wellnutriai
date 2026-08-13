import { HEALTH_DATA_CONSENT_VERSION } from '@/lib/healthDataConsent';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import crypto from 'crypto';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function hashIp(ip: string): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY ?? 'wellnutriai';
  return crypto.createHmac('sha256', secret).update(ip).digest('hex');
}

// Revoga o consentimento de dado de saúde. Não apaga o questionário
// já respondido nem planos já gerados — isso seria uma decisão
// destrutiva separada (exclusão de conta já existe para isso, ver
// /api/account/delete). O que a revogação garante é que nenhum
// PROCESSAMENTO NOVO desses dados aconteça silenciosamente depois
// dela: com HEALTH_DATA_CONSENT_REQUIRED ligada,
// requireHealthDataConsent() passa a bloquear novo envio de
// questionário e nova geração de plano até um consentimento vigente
// ser concedido de novo (ver /api/health-data-consent).
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const revokedAt = new Date().toISOString();
  const userAgent = req.headers.get('user-agent') ?? null;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const service = createServiceClient();

  const { error } = await service
    .from('profiles')
    .update({ health_data_consent_revoked_at: revokedAt })
    .eq('id', user.id);

  if (error) {
    console.error('[health-data-consent/revoke] erro ao atualizar profile:', error);
    return NextResponse.json({ error: 'Erro ao registrar revogação' }, { status: 500 });
  }

  const { error: auditError } = await service.from('health_data_consents').insert({
    user_id: user.id,
    action: 'revoked',
    version: HEALTH_DATA_CONSENT_VERSION,
    user_agent: userAgent,
    ip_hash: ip ? hashIp(ip) : null,
  });

  if (auditError) {
    console.error('[health-data-consent/revoke] erro ao gravar auditoria:', auditError);
  }

  return NextResponse.json({ ok: true });
}

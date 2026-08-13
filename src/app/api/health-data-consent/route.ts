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

// Concede (ou renova, após revogação/mudança de versão) o
// consentimento específico para o dado de saúde do questionário
// nutricional. Espelha src/app/api/accept-terms/route.ts: grava via
// service_role (profiles.health_data_consent_* só é gravável por
// service_role — ver 026_health_data_consent.sql), e mantém um
// histórico auditável separado em health_data_consents.
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const grantedAt = new Date().toISOString();
  const userAgent = req.headers.get('user-agent') ?? null;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;

  const service = createServiceClient();

  const { error } = await service
    .from('profiles')
    .update({
      health_data_consent_version: HEALTH_DATA_CONSENT_VERSION,
      health_data_consent_at: grantedAt,
      health_data_consent_revoked_at: null,
    })
    .eq('id', user.id);

  if (error) {
    console.error('[health-data-consent] erro ao atualizar profile:', error);
    return NextResponse.json({ error: 'Erro ao registrar consentimento' }, { status: 500 });
  }

  const { error: auditError } = await service.from('health_data_consents').insert({
    user_id: user.id,
    action: 'granted',
    version: HEALTH_DATA_CONSENT_VERSION,
    user_agent: userAgent,
    ip_hash: ip ? hashIp(ip) : null,
  });

  if (auditError) {
    console.error('[health-data-consent] erro ao gravar auditoria:', auditError);
  }

  return NextResponse.json({ ok: true });
}

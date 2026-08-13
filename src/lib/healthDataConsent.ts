import type { SupabaseClient } from '@supabase/supabase-js';

export const HEALTH_DATA_CONSENT_VERSION = process.env.HEALTH_DATA_CONSENT_VERSION || '1';

// Enquanto false (padrão), a estrutura existe — colunas, tabela de
// auditoria, endpoints de concessão/revogação — mas não bloqueia
// nada. Decidir se consentimento é de fato a base legal aplicável ao
// dado de saúde do questionário (vs. outra base do art. 7º/11 da
// LGPD) é do jurídico, não do código. Ligar esta variável é o que
// torna o consentimento obrigatório antes de coletar/processar o
// questionário. Ver docs/PRODUCTION_CHECKLIST.md.
export const HEALTH_DATA_CONSENT_REQUIRED = process.env.HEALTH_DATA_CONSENT_REQUIRED === 'true';

export type HealthDataConsentReason = 'not_granted' | 'outdated' | 'revoked';

export interface HealthDataConsentCheckResult {
  ok: boolean;
  reason?: HealthDataConsentReason;
}

const REASON_MESSAGES: Record<HealthDataConsentReason, string> = {
  not_granted: 'É preciso consentir com o uso dos dados de saúde do questionário antes de continuar.',
  outdated: 'O termo de consentimento de dados de saúde foi atualizado — confirme novamente antes de continuar.',
  revoked: 'Você revogou o consentimento para uso dos seus dados de saúde. Conceda novamente para usar esta funcionalidade.',
};

export function healthDataConsentReasonMessage(reason: HealthDataConsentReason): string {
  return REASON_MESSAGES[reason];
}

export interface HealthDataConsentProfileFields {
  health_data_consent_version: string | null;
  health_data_consent_at: string | null;
  health_data_consent_revoked_at: string | null;
}

/**
 * Função pura, testável sem mockar o Supabase — mesmo formato de
 * src/lib/consentCheck.ts::evaluateConsent(). Revogação tem
 * prioridade sobre versão desatualizada: um usuário que revogou não
 * deve ver "atualize sua versão", e sim "você revogou".
 */
export function evaluateHealthDataConsent(
  profile: HealthDataConsentProfileFields | null,
  currentVersion: string,
): HealthDataConsentCheckResult {
  if (!profile?.health_data_consent_at) return { ok: false, reason: 'not_granted' };
  if (profile.health_data_consent_revoked_at) return { ok: false, reason: 'revoked' };
  if (profile.health_data_consent_version !== currentVersion) return { ok: false, reason: 'outdated' };
  return { ok: true };
}

/**
 * Checagem centralizada — só bloqueia de verdade quando
 * HEALTH_DATA_CONSENT_REQUIRED está ligada (ver comentário acima).
 */
export async function requireHealthDataConsent(
  supabase: SupabaseClient,
  userId: string,
): Promise<HealthDataConsentCheckResult> {
  if (!HEALTH_DATA_CONSENT_REQUIRED) return { ok: true };

  const { data: profile } = await supabase
    .from('profiles')
    .select('health_data_consent_version, health_data_consent_at, health_data_consent_revoked_at')
    .eq('id', userId)
    .single();

  return evaluateHealthDataConsent(profile, HEALTH_DATA_CONSENT_VERSION);
}

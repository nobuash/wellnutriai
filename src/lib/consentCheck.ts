import { PRIVACY_VERSION, TERMS_VERSION } from '@/lib/consent';
import type { SupabaseClient } from '@supabase/supabase-js';

export type ConsentReason = 'not_accepted' | 'outdated_terms' | 'outdated_privacy';

export interface ConsentCheckResult {
  ok: boolean;
  reason?: ConsentReason;
}

const REASON_MESSAGES: Record<ConsentReason, string> = {
  not_accepted: 'Aceite os termos antes de usar este recurso.',
  outdated_terms: 'Os termos de uso foram atualizados — aceite a nova versão antes de continuar.',
  outdated_privacy: 'A política de privacidade foi atualizada — aceite a nova versão antes de continuar.',
};

export function consentReasonMessage(reason: ConsentReason): string {
  return REASON_MESSAGES[reason];
}

export interface ConsentProfileFields {
  accepted_terms: boolean | null;
  terms_version: string | null;
  privacy_version: string | null;
}

/**
 * Função pura — decide se o consentimento está em dia, dado o estado
 * do profile e as versões atuais exigidas. Separada de
 * requireCurrentConsent() especificamente pra ser testável sem mockar
 * o Supabase (ver src/lib/__tests__/consentCheck.test.ts).
 */
export function evaluateConsent(
  profile: ConsentProfileFields | null,
  currentTermsVersion: string,
  currentPrivacyVersion: string,
): ConsentCheckResult {
  if (!profile?.accepted_terms) return { ok: false, reason: 'not_accepted' };
  if (profile.terms_version !== currentTermsVersion) return { ok: false, reason: 'outdated_terms' };
  if (profile.privacy_version !== currentPrivacyVersion) return { ok: false, reason: 'outdated_privacy' };
  return { ok: true };
}

/**
 * Checagem centralizada de consentimento — usada por toda API sensível
 * (geração de plano, chat, análise de foto, questionário). Antes, cada
 * rota checava só `accepted_terms = true` isoladamente, sem confirmar
 * a versão — um usuário que aceitou a v1 dos termos continuava
 * passando pela checagem mesmo depois de TERMS_VERSION subir para v2
 * (que ele nunca viu). accepted_terms/terms_version/privacy_version só
 * são graváveis por service_role (ver
 * 014_secure_consent_columns.sql), então este SELECT reflete sempre um
 * aceite real feito pela rota oficial /api/accept-terms.
 */
export async function requireCurrentConsent(
  supabase: SupabaseClient,
  userId: string,
): Promise<ConsentCheckResult> {
  const { data: profile } = await supabase
    .from('profiles')
    .select('accepted_terms, terms_version, privacy_version')
    .eq('id', userId)
    .single();

  return evaluateConsent(profile, TERMS_VERSION, PRIVACY_VERSION);
}

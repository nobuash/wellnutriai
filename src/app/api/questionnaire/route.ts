import { requireCurrentConsent, consentReasonMessage } from '@/lib/consentCheck';
import { healthDataConsentReasonMessage, requireHealthDataConsent } from '@/lib/healthDataConsent';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { questionnaireSchema } from '@/lib/validation';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

function normalizeStringArray(items: string[]): string[] {
  return items
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
    .slice(0, 30);
}

// Antes, o questionário era inserido direto pelo client Supabase do
// navegador (nutrition_questionnaires agora só permite SELECT pro
// usuário — ver 017_restrict_server_generated_tables.sql). Esta rota
// é o único jeito válido de gravar um questionário: autentica, exige
// consentimento atual, valida com Zod (mesma barreira dupla que os
// CHECK constraints do banco, não uma alternativa a eles) e normaliza
// strings antes de gravar via service role.
export async function POST(req: Request) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const consent = await requireCurrentConsent(supabase, user.id);
  if (!consent.ok) {
    return NextResponse.json({ error: consentReasonMessage(consent.reason!) }, { status: 403 });
  }

  // Não-op enquanto HEALTH_DATA_CONSENT_REQUIRED não estiver ligada —
  // ver src/lib/healthDataConsent.ts.
  const healthConsent = await requireHealthDataConsent(supabase, user.id);
  if (!healthConsent.ok) {
    return NextResponse.json(
      { error: healthDataConsentReasonMessage(healthConsent.reason!), healthDataConsent: false },
      { status: 403 },
    );
  }

  const json = await req.json().catch(() => ({}));
  const parsed = questionnaireSchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados do questionário inválidos', details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const normalized = {
    ...data,
    allergies: normalizeStringArray(data.allergies),
    dietary_preferences: normalizeStringArray(data.dietary_preferences),
    disliked_foods: normalizeStringArray(data.disliked_foods),
    routine: data.routine?.trim() || null,
    other_medical_condition: data.other_medical_condition?.trim() || null,
  };

  const service = createServiceClient();
  const { data: saved, error } = await service
    .from('nutrition_questionnaires')
    .insert({ ...normalized, user_id: user.id })
    .select()
    .single();

  if (error) {
    console.error('[questionnaire] erro ao salvar:', error);
    return NextResponse.json({ error: 'Erro ao salvar questionário' }, { status: 500 });
  }

  return NextResponse.json({ questionnaire: saved });
}

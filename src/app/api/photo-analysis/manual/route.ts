import { MODELS, openai } from '@/lib/openai/client';
import { MANUAL_ANALYSIS_PROMPT } from '@/lib/openai/prompts';
import { featureLimitReason, PLAN_LIMITS } from '@/lib/plans';
import { getUserEntitlement } from '@/lib/entitlement';
import { checkDailyAiBudget, checkUserMonthlyBudget, consumeUsageQuota, logAiUsage, monthKey } from '@/lib/aiUsage';
import { photoAnalysisResultSchema } from '@/lib/photoAnalysisSchema';
import { requireCurrentConsent, consentReasonMessage } from '@/lib/consentCheck';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 30;

const bodySchema = z.object({
  foods: z
    .array(z.object({ name: z.string().min(1), grams: z.number().positive() }))
    .min(1)
    .max(20),
});

export async function POST(req: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const consent = await requireCurrentConsent(supabase, user.id);
  if (!consent.ok) {
    return NextResponse.json({ error: consentReasonMessage(consent.reason!) }, { status: 403 });
  }

  const entitlement = await getUserEntitlement(supabase, user.id);

  const budget = await checkDailyAiBudget();
  if (!budget.allowed) {
    return NextResponse.json({ error: 'Estamos com alta demanda no momento. Tente novamente mais tarde.' }, { status: 503 });
  }

  const userBudget = await checkUserMonthlyBudget(user.id);
  if (!userBudget.allowed) {
    return NextResponse.json(
      { error: 'Você atingiu o limite de uso de IA do mês. Fale com o suporte se precisar de mais.' },
      { status: 402 },
    );
  }

  // Mesmo balde de cota da análise por foto — é a mesma feature PRO,
  // só com outra forma de entrada.
  const limit = PLAN_LIMITS[entitlement.plan].photoAnalysisPerMonth;
  const quota = await consumeUsageQuota(user.id, 'photo_analysis', monthKey(), limit);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: featureLimitReason(entitlement.plan, 'photoAnalysisPerMonth'), upgrade: entitlement.plan === 'free' },
      { status: 402 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const foodsList = parsed.data.foods
    .map((f) => `- ${f.name}: ${f.grams}g`)
    .join('\n');

  try {
    const startedAt = Date.now();
    const completion = await openai.chat.completions.create({
      model: MODELS.TEXT,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      max_tokens: 800,
      messages: [
        { role: 'system', content: 'Retorne apenas JSON válido conforme instruções.' },
        {
          role: 'user',
          content: `${MANUAL_ANALYSIS_PROMPT}\n\nAlimentos informados:\n${foodsList}`,
        },
      ],
    });

    void logAiUsage({
      userId: user.id,
      feature: 'photo_analysis_manual',
      model: MODELS.TEXT,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('IA não retornou conteúdo');

    const parsedResult = photoAnalysisResultSchema.safeParse(JSON.parse(raw));
    if (!parsedResult.success) {
      console.error('[photo-analysis/manual] resposta da IA fora do schema:', parsedResult.error.flatten());
      return NextResponse.json({ error: 'Não foi possível interpretar a análise. Tente novamente.' }, { status: 502 });
    }
    const result = parsedResult.data;

    // Salva no histórico reutilizando a mesma tabela — só service_role
    // pode escrever (ver 017_restrict_server_generated_tables.sql).
    await createServiceClient().from('meal_photo_analysis').insert({
      user_id: user.id,
      image_url: 'manual', // sem foto
      result,
    });

    return NextResponse.json({ result });
  } catch (err) {
    console.error('[photo-analysis/manual] error:', err);
    return NextResponse.json({ error: 'Falha na análise' }, { status: 500 });
  }
}

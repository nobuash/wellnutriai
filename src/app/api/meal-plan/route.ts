import { MODELS, openai } from '@/lib/openai/client';
import { formatKnowledgeContext, searchKnowledge } from '@/lib/knowledge/search';
import { buildMealPlanPrompt, LEGAL_DISCLAIMER } from '@/lib/openai/prompts';
import { calculateEnergyTargets, type EnergyResult } from '@/lib/nutrition/energy';
import { validateMealPlanMath } from '@/lib/nutrition/mealPlanMath';
import { featureLimitReason, PLAN_LIMITS } from '@/lib/plans';
import { getUserEntitlement } from '@/lib/entitlement';
import { checkDailyAiBudget, checkUserMonthlyBudget, consumeUsageQuota, logAiUsage, monthKey } from '@/lib/aiUsage';
import {
  findForbiddenFoods,
  getNutritionSafetyMode,
  MEDICAL_RESTRICTION_MESSAGE,
  mealPlanContentSchema,
} from '@/lib/mealPlanSafety';
import { requireCurrentConsent, consentReasonMessage } from '@/lib/consentCheck';
import { healthDataConsentReasonMessage, requireHealthDataConsent } from '@/lib/healthDataConsent';
import { isRegulatoryReviewApproved, REGULATORY_HOLD_MESSAGE } from '@/lib/regulatory';
import { checkDistributedRateLimit } from '@/lib/distributedRateLimit';
import { rateLimit } from '@/lib/ratelimit';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import type { NutritionQuestionnaire } from '@/types/database';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  if (!isRegulatoryReviewApproved()) {
    return NextResponse.json({ error: REGULATORY_HOLD_MESSAGE, regulatoryHold: true }, { status: 503 });
  }

  // Burst local (rápido) + distribuído (funciona entre instâncias Vercel).
  if (!rateLimit(`meal-plan:${user.id}`, 5, 3600)) {
    return NextResponse.json({ error: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });
  }
  if (!(await checkDistributedRateLimit(`meal-plan:${user.id}`, 5, 3600))) {
    return NextResponse.json({ error: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });
  }

  const consent = await requireCurrentConsent(supabase, user.id);
  if (!consent.ok) {
    return NextResponse.json({ error: consentReasonMessage(consent.reason!) }, { status: 403 });
  }

  const healthConsent = await requireHealthDataConsent(supabase, user.id);
  if (!healthConsent.ok) {
    return NextResponse.json(
      { error: healthDataConsentReasonMessage(healthConsent.reason!), healthDataConsent: false },
      { status: 403 },
    );
  }

  const { data: questionnaire } = (await supabase
    .from('nutrition_questionnaires')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()) as { data: NutritionQuestionnaire | null };

  if (!questionnaire) {
    return NextResponse.json({ error: 'Responda o questionário primeiro' }, { status: 400 });
  }

  // Condições de alto risco não recebem plano personalizado automatizado
  // no MVP — checado antes de consumir cota ou chamar a IA.
  if (getNutritionSafetyMode(questionnaire) === 'restricted') {
    return NextResponse.json(
      { error: MEDICAL_RESTRICTION_MESSAGE, medicalRestriction: true },
      { status: 422 },
    );
  }

  // Questionários respondidos antes do campo biological_sex existir
  // (ver migration 027) não têm o dado necessário para o cálculo
  // determinístico — pedir para atualizar em vez de fabricar um valor.
  const energy = calculateEnergyTargets({
    weightKg: questionnaire.weight,
    heightCm: questionnaire.height,
    age: questionnaire.age,
    biologicalSex: questionnaire.biological_sex,
    activityLevel: questionnaire.activity_level,
    goal: questionnaire.goal,
  });
  if (!energy) {
    return NextResponse.json(
      { error: 'Responda novamente o questionário para informar seu sexo biológico — é necessário para calcular sua meta de calorias.', questionnaireOutdated: true },
      { status: 400 },
    );
  }

  const entitlement = await getUserEntitlement(supabase, user.id);

  const budget = await checkDailyAiBudget();
  if (!budget.allowed) {
    return NextResponse.json(
      { error: 'Estamos com alta demanda no momento. Tente novamente mais tarde.' },
      { status: 503 },
    );
  }

  const userBudget = await checkUserMonthlyBudget(user.id);
  if (!userBudget.allowed) {
    return NextResponse.json(
      { error: 'Você atingiu o limite de uso de IA do mês. Fale com o suporte se precisar de mais.' },
      { status: 402 },
    );
  }

  const limit = PLAN_LIMITS[entitlement.plan].mealPlansPerMonth;
  const quota = await consumeUsageQuota(user.id, 'meal_plan', monthKey(), limit);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: featureLimitReason(entitlement.plan, 'mealPlansPerMonth'), upgrade: entitlement.plan === 'free' },
      { status: 402 },
    );
  }

  const knowledgeQuery = `nutrição ${questionnaire.goal} ${questionnaire.activity_level} plano alimentar macronutrientes`;
  const knowledgeChunks = await searchKnowledge(knowledgeQuery, 5, 0.55, user.id);
  const knowledgeContext = formatKnowledgeContext(knowledgeChunks);

  const startedAt = Date.now();

  try {
    const { content, inputTokens, outputTokens } = await generateValidatedMealPlan(questionnaire, energy, knowledgeContext);

    await logAiUsage({
      userId: user.id,
      feature: 'meal_plan',
      model: MODELS.TEXT,
      inputTokens,
      outputTokens,
      status: content ? 'ok' : 'error',
      latencyMs: Date.now() - startedAt,
    });

    if (!content) {
      return NextResponse.json(
        { error: 'Não foi possível gerar um plano seguro com as restrições informadas. Tente novamente ou ajuste o questionário.' },
        { status: 422 },
      );
    }

    // meal_plans só aceita escrita via service_role (RLS) — ver
    // 017_restrict_server_generated_tables.sql.
    const { data: saved, error } = await createServiceClient()
      .from('meal_plans')
      .insert({
        user_id: user.id,
        questionnaire_id: questionnaire.id,
        content,
        calories_estimate: content.total_calories ?? null,
      })
      .select()
      .single();

    if (error) throw error;

    return NextResponse.json({ mealPlan: saved });
  } catch (err) {
    console.error('[meal-plan] error:', (err as Error).message);
    await logAiUsage({
      userId: user.id, feature: 'meal_plan', model: MODELS.TEXT,
      inputTokens: 0, outputTokens: 0, status: 'error', latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: 'Falha ao gerar plano. Tente novamente.' }, { status: 500 });
  }
}

/**
 * Gera o plano e valida estruturalmente (Zod) + contra alergias do
 * usuário. Se a primeira tentativa vier com item proibido, tenta
 * corrigir UMA vez pedindo à IA para substituir o item problemático.
 * Se ainda assim não vier seguro, retorna content: null — nunca
 * entrega um plano que pode conter algo que o usuário é alérgico.
 */
async function generateValidatedMealPlan(
  questionnaire: NutritionQuestionnaire,
  energy: EnergyResult,
  knowledgeContext: string,
) {
  const basePrompt = buildMealPlanPrompt(questionnaire, energy, knowledgeContext);
  let inputTokens = 0;
  let outputTokens = 0;
  let correctionInstruction = '';

  // No máximo uma tentativa de correção controlada (attempt 0 = original,
  // attempt 1 = retry único) — se ainda assim vier inconsistente, aborta
  // sem salvar (ver retorno { content: null } no fim da função).
  for (let attempt = 0; attempt < 2; attempt++) {
    const extraInstruction = correctionInstruction;

    const completion = await openai.chat.completions.create({
      model: MODELS.TEXT,
      response_format: { type: 'json_object' },
      temperature: 0.6,
      max_tokens: 2000,
      messages: [
        { role: 'system', content: 'Você retorna apenas JSON válido conforme instruções.' },
        { role: 'user', content: basePrompt + extraInstruction },
      ],
    });

    inputTokens += completion.usage?.prompt_tokens ?? 0;
    outputTokens += completion.usage?.completion_tokens ?? 0;

    const raw = completion.choices[0]?.message?.content;
    if (!raw) continue;

    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      continue;
    }

    const result = mealPlanContentSchema.safeParse(parsed);
    if (!result.success) {
      console.error('[meal-plan] resposta da IA fora do schema:', result.error.flatten());
      continue;
    }

    const content = result.data;
    content.disclaimer = content.disclaimer || LEGAL_DISCLAIMER;

    const forbidden = findForbiddenFoods(content, questionnaire.allergies);
    const mathIssues = validateMealPlanMath(content, energy.targetCalories);

    if (forbidden.length === 0 && mathIssues.length === 0) {
      return { content, inputTokens, outputTokens };
    }

    if (forbidden.length > 0) {
      console.warn(`[meal-plan] tentativa ${attempt + 1} continha itens proibidos:`, forbidden);
      correctionInstruction =
        '\n\nATENÇÃO: a geração anterior incluiu alimento(s) proibido(s) por alergia. Gere novamente, ' +
        'substituindo qualquer alimento da lista de proibições por uma alternativa segura equivalente.';
    } else {
      // Nunca loga o conteúdo do plano em si — só os códigos/mensagens
      // estruturais do que ficou matematicamente inconsistente.
      console.warn(`[meal-plan] tentativa ${attempt + 1} com inconsistência matemática:`, mathIssues);
      correctionInstruction =
        `\n\nATENÇÃO: a geração anterior tinha inconsistência matemática (${mathIssues.map((i) => i.code).join(', ')}). ` +
        `Gere novamente com total_calories = ${energy.targetCalories} exatamente, macros consistentes com a regra ` +
        '4 kcal/g (proteína/carboidrato) e 9 kcal/g (gordura), e a soma das calorias das refeições igual ao total.';
    }
  }

  return { content: null, inputTokens, outputTokens };
}

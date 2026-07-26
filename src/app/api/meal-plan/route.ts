import { MODELS, openai } from '@/lib/openai/client';
import { formatKnowledgeContext, searchKnowledge } from '@/lib/knowledge/search';
import { buildMealPlanPrompt, LEGAL_DISCLAIMER } from '@/lib/openai/prompts';
import { featureLimitReason, PLAN_LIMITS } from '@/lib/plans';
import { getUserEntitlement } from '@/lib/entitlement';
import { checkDailyAiBudget, checkUserMonthlyBudget, consumeUsageQuota, logAiUsage, monthKey } from '@/lib/aiUsage';
import {
  findForbiddenFoods,
  isHighRiskCondition,
  MEDICAL_RESTRICTION_MESSAGE,
  mealPlanContentSchema,
} from '@/lib/mealPlanSafety';
import { rateLimit } from '@/lib/ratelimit';
import { createClient } from '@/lib/supabase/server';
import type { NutritionQuestionnaire } from '@/types/database';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

export async function POST() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Rate limit: 5 gerações por hora por usuário (burst protection local)
  if (!rateLimit(`meal-plan:${user.id}`, 5, 3600)) {
    return NextResponse.json({ error: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('accepted_terms')
    .eq('id', user.id)
    .single();

  if (!profile?.accepted_terms) {
    return NextResponse.json({ error: 'Aceite os termos antes de usar' }, { status: 403 });
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
  if (isHighRiskCondition(questionnaire)) {
    return NextResponse.json(
      { error: MEDICAL_RESTRICTION_MESSAGE, medicalRestriction: true },
      { status: 422 },
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
  const knowledgeChunks = await searchKnowledge(knowledgeQuery, 5);
  const knowledgeContext = formatKnowledgeContext(knowledgeChunks);

  const startedAt = Date.now();

  try {
    const { content, inputTokens, outputTokens } = await generateValidatedMealPlan(questionnaire, knowledgeContext);

    void logAiUsage({
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

    const { data: saved, error } = await supabase
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
    void logAiUsage({
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
  knowledgeContext: string,
) {
  const basePrompt = buildMealPlanPrompt(questionnaire, knowledgeContext);
  let inputTokens = 0;
  let outputTokens = 0;

  for (let attempt = 0; attempt < 2; attempt++) {
    const extraInstruction = attempt === 0 ? '' :
      '\n\nATENÇÃO: a geração anterior incluiu alimento(s) proibido(s) por alergia. Gere novamente, ' +
      'substituindo qualquer alimento da lista de proibições por uma alternativa segura equivalente.';

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
    if (forbidden.length === 0) {
      return { content, inputTokens, outputTokens };
    }

    console.warn(`[meal-plan] tentativa ${attempt + 1} continha itens proibidos:`, forbidden);
  }

  return { content: null, inputTokens, outputTokens };
}

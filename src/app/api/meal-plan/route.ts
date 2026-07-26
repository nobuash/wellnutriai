import { MODELS, openai } from '@/lib/openai/client';
import { formatKnowledgeContext, searchKnowledge } from '@/lib/knowledge/search';
import { buildMealPlanPrompt, LEGAL_DISCLAIMER } from '@/lib/openai/prompts';
import { canUseFeature } from '@/lib/plans';
import { getUserEntitlement } from '@/lib/entitlement';
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

  // Rate limit: 5 gerações por hora por usuário
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

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('meal_plans')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', startOfMonth.toISOString());

  const check = canUseFeature(entitlement.plan, 'mealPlansPerMonth', count ?? 0);
  if (!check.allowed) {
    return NextResponse.json({ error: check.reason, upgrade: true }, { status: 402 });
  }

  const knowledgeQuery = `nutrição ${questionnaire.goal} ${questionnaire.activity_level} plano alimentar macronutrientes`;
  const knowledgeChunks = await searchKnowledge(knowledgeQuery, 5);
  const knowledgeContext = formatKnowledgeContext(knowledgeChunks);

  try {
    const content = await generateValidatedMealPlan(questionnaire, knowledgeContext);

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
    return NextResponse.json({ error: 'Falha ao gerar plano. Tente novamente.' }, { status: 500 });
  }
}

/**
 * Gera o plano e valida estruturalmente (Zod) + contra alergias do
 * usuário. Se a primeira tentativa vier com item proibido, tenta
 * corrigir UMA vez pedindo à IA para substituir o item problemático.
 * Se ainda assim não vier seguro, retorna null — nunca entrega um
 * plano que pode conter algo que o usuário é alérgico.
 */
async function generateValidatedMealPlan(
  questionnaire: NutritionQuestionnaire,
  knowledgeContext: string,
) {
  const basePrompt = buildMealPlanPrompt(questionnaire, knowledgeContext);

  for (let attempt = 0; attempt < 2; attempt++) {
    const extraInstruction = attempt === 0 ? '' :
      '\n\nATENÇÃO: a geração anterior incluiu alimento(s) proibido(s) por alergia. Gere novamente, ' +
      'substituindo qualquer alimento da lista de proibições por uma alternativa segura equivalente.';

    const completion = await openai.chat.completions.create({
      model: MODELS.TEXT,
      response_format: { type: 'json_object' },
      temperature: 0.6,
      messages: [
        { role: 'system', content: 'Você retorna apenas JSON válido conforme instruções.' },
        { role: 'user', content: basePrompt + extraInstruction },
      ],
    });

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
      return content;
    }

    console.warn(`[meal-plan] tentativa ${attempt + 1} continha itens proibidos:`, forbidden);
  }

  return null;
}

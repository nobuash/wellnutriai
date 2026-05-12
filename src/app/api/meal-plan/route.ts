import { MODELS, openai } from '@/lib/openai/client';
import { formatKnowledgeContext, searchKnowledge } from '@/lib/knowledge/search';
import { buildMealPlanPrompt, LEGAL_DISCLAIMER } from '@/lib/openai/prompts';
import { canUseFeature } from '@/lib/plans';
import { rateLimit } from '@/lib/ratelimit';
import { createClient } from '@/lib/supabase/server';
import type { MealPlanContent, NutritionQuestionnaire } from '@/types/database';
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
    .select('plan, accepted_terms')
    .eq('id', user.id)
    .single();

  if (!profile?.accepted_terms) {
    return NextResponse.json({ error: 'Aceite os termos antes de usar' }, { status: 403 });
  }

  const startOfMonth = new Date();
  startOfMonth.setDate(1);
  startOfMonth.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('meal_plans')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .gte('created_at', startOfMonth.toISOString());

  const check = canUseFeature(profile.plan, 'mealPlansPerMonth', count ?? 0);
  if (!check.allowed) {
    return NextResponse.json({ error: check.reason, upgrade: true }, { status: 402 });
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

  const knowledgeQuery = `nutrição ${questionnaire.goal} ${questionnaire.activity_level} plano alimentar macronutrientes`;
  const knowledgeChunks = await searchKnowledge(knowledgeQuery, 5);
  const knowledgeContext = formatKnowledgeContext(knowledgeChunks);

  try {
    const completion = await openai.chat.completions.create({
      model: MODELS.TEXT,
      response_format: { type: 'json_object' },
      temperature: 0.6,
      messages: [
        { role: 'system', content: 'Você retorna apenas JSON válido conforme instruções.' },
        { role: 'user', content: buildMealPlanPrompt(questionnaire, knowledgeContext) },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('IA não retornou conteúdo');

    const content = JSON.parse(raw) as MealPlanContent;
    content.disclaimer = content.disclaimer || LEGAL_DISCLAIMER;

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

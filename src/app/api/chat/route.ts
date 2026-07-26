import { MODELS, openai } from '@/lib/openai/client';
import { formatKnowledgeContext, searchKnowledge } from '@/lib/knowledge/search';
import { buildChatSystemPrompt } from '@/lib/openai/prompts';
import { canUseFeature } from '@/lib/plans';
import { getUserEntitlement } from '@/lib/entitlement';
import { findForbiddenFoods, isHighRiskCondition, mealPlanContentSchema } from '@/lib/mealPlanSafety';
import { rateLimit } from '@/lib/ratelimit';
import { createClient } from '@/lib/supabase/server';
import type { ChatMessage, MealPlan, MealPlanContent, NutritionQuestionnaire } from '@/types/database';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 30;

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
});

export async function POST(req: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Rate limit: 30 mensagens por minuto por usuário (burst protection)
  if (!rateLimit(`chat:${user.id}`, 30, 60)) {
    return NextResponse.json({ error: 'Muitas requisições. Aguarde um momento.' }, { status: 429 });
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('accepted_terms')
    .eq('id', user.id)
    .single();

  if (!profile?.accepted_terms) {
    return NextResponse.json({ error: 'Aceite os termos' }, { status: 403 });
  }

  const entitlement = await getUserEntitlement(supabase, user.id);

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Mensagem inválida' }, { status: 400 });
  }

  // Limite diário por plano
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('role', 'user')
    .gte('created_at', startOfDay.toISOString());

  const check = canUseFeature(entitlement.plan, 'chatMessagesPerDay', count ?? 0);
  if (!check.allowed) {
    return NextResponse.json({ error: check.reason, upgrade: true }, { status: 402 });
  }

  const [{ data: questionnaire }, { data: mealPlan }, { data: history }] = await Promise.all([
    supabase.from('nutrition_questionnaires').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('meal_plans').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('chat_messages').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(20),
  ]) as [
    { data: NutritionQuestionnaire | null },
    { data: MealPlan | null },
    { data: ChatMessage[] | null },
  ];

  const mealPlanContent = (mealPlan?.content as MealPlanContent | undefined) ?? null;

  const knowledgeChunks = await searchKnowledge(parsed.data.message);
  const knowledgeContext = formatKnowledgeContext(knowledgeChunks);

  const systemPrompt = buildChatSystemPrompt(questionnaire, mealPlanContent, knowledgeContext);

  const historyMessages = (history ?? []).reverse().map((m) => ({
    role: m.role === 'ai' ? ('assistant' as const) : ('user' as const),
    content: m.message,
  }));

  try {
    await supabase.from('chat_messages').insert({
      user_id: user.id, role: 'user', message: parsed.data.message,
    });

    const completion = await openai.chat.completions.create({
      model: MODELS.TEXT,
      response_format: { type: 'json_object' },
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: parsed.data.message },
      ],
    });

    const raw = completion.choices[0]?.message?.content ?? '{}';
    let reply = 'Desculpe, não consegui processar.';
    let mealPlanUpdated = false;

    try {
      const parsed2 = JSON.parse(raw) as { reply?: string; meal_plan_update?: unknown };
      reply = parsed2.reply ?? reply;

      if (parsed2.meal_plan_update && mealPlan?.id) {
        if (questionnaire && isHighRiskCondition(questionnaire)) {
          // Não deixamos o chat reescrever automaticamente um plano de
          // usuário com condição de alto risco — mesma regra aplicada na
          // geração inicial (ver src/app/api/meal-plan/route.ts).
          reply += '\n\n_Não consigo ajustar automaticamente os números do seu plano por causa da condição de saúde informada — recomendo revisar essa mudança com um(a) nutricionista._';
        } else {
          const validated = mealPlanContentSchema.safeParse(parsed2.meal_plan_update);

          if (validated.success) {
            const forbidden = findForbiddenFoods(validated.data, questionnaire?.allergies ?? []);

            if (forbidden.length === 0) {
              const updatedContent: MealPlanContent = {
                ...validated.data,
                disclaimer: validated.data.disclaimer || mealPlanContent?.disclaimer || '',
              };

              await supabase
                .from('meal_plans')
                .update({ content: updatedContent, calories_estimate: updatedContent.total_calories ?? null })
                .eq('id', mealPlan.id);

              mealPlanUpdated = true;
            } else {
              console.warn('[chat] meal_plan_update rejeitado por alergia:', forbidden);
              reply += `\n\n_Não apliquei essa mudança porque o resultado incluiria ${forbidden.join(', ')}, que está na sua lista de alergias/restrições._`;
            }
          } else {
            console.error('[chat] meal_plan_update fora do schema:', validated.error.flatten());
          }
        }
      }
    } catch {
      reply = raw;
    }

    await supabase.from('chat_messages').insert({
      user_id: user.id, role: 'ai', message: reply,
    });

    return NextResponse.json({ reply, mealPlanUpdated });
  } catch (err) {
    console.error('[chat] error:', (err as Error).message);
    return NextResponse.json({ error: 'Falha no chat' }, { status: 500 });
  }
}

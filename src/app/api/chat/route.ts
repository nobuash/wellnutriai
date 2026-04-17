import { MODELS, openai } from '@/lib/openai/client';
import { formatKnowledgeContext, searchKnowledge } from '@/lib/knowledge/search';
import { buildChatSystemPrompt } from '@/lib/openai/prompts';
import { canUseFeature } from '@/lib/plans';
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

  const { data: profile } = await supabase
    .from('profiles')
    .select('plan, accepted_terms')
    .eq('id', user.id)
    .single();

  if (!profile?.accepted_terms) {
    return NextResponse.json({ error: 'Aceite os termos' }, { status: 403 });
  }

  const json = await req.json();
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Mensagem inválida' }, { status: 400 });
  }

  // Limite diário
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const { count } = await supabase
    .from('chat_messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', user.id)
    .eq('role', 'user')
    .gte('created_at', startOfDay.toISOString());

  const check = canUseFeature(profile.plan, 'chatMessagesPerDay', count ?? 0);
  if (!check.allowed) {
    return NextResponse.json({ error: check.reason, upgrade: true }, { status: 402 });
  }

  // Contexto: questionário + plano + histórico
  const [{ data: questionnaire }, { data: mealPlan }, { data: history }] = await Promise.all([
    supabase.from('nutrition_questionnaires').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('meal_plans').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(1).maybeSingle(),
    supabase.from('chat_messages').select('*').eq('user_id', user.id)
      .order('created_at', { ascending: false }).limit(10),
  ]) as [
    { data: NutritionQuestionnaire | null },
    { data: MealPlan | null },
    { data: ChatMessage[] | null },
  ];

  const summary = (mealPlan?.content as MealPlanContent | undefined)?.summary;

  // Busca semântica na base de conhecimento científico
  const knowledgeChunks = await searchKnowledge(parsed.data.message);
  const knowledgeContext = formatKnowledgeContext(knowledgeChunks);

  const systemPrompt = buildChatSystemPrompt(questionnaire, summary, knowledgeContext);

  const historyMessages = (history ?? []).reverse().map((m) => ({
    role: m.role === 'ai' ? ('assistant' as const) : ('user' as const),
    content: m.message,
  }));

  try {
    // Salva mensagem do usuário
    await supabase.from('chat_messages').insert({
      user_id: user.id, role: 'user', message: parsed.data.message,
    });

    const completion = await openai.chat.completions.create({
      model: MODELS.TEXT,
      temperature: 0.7,
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: parsed.data.message },
      ],
    });

    const reply = completion.choices[0]?.message?.content ?? 'Desculpe, não consegui processar.';

    await supabase.from('chat_messages').insert({
      user_id: user.id, role: 'ai', message: reply,
    });

    return NextResponse.json({ reply });
  } catch (err) {
    console.error('[chat] error:', err);
    return NextResponse.json({ error: 'Falha no chat' }, { status: 500 });
  }
}

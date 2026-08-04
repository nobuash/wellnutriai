import { MODELS, openai } from '@/lib/openai/client';
import { formatKnowledgeContext, searchKnowledge } from '@/lib/knowledge/search';
import { buildChatSystemPrompt } from '@/lib/openai/prompts';
import { featureLimitReason, PLAN_LIMITS } from '@/lib/plans';
import { getUserEntitlement } from '@/lib/entitlement';
import { checkDailyAiBudget, checkUserMonthlyBudget, consumeUsageQuota, logAiUsage, monthKey } from '@/lib/aiUsage';
import { findForbiddenFoods, isHighRiskCondition, mealPlanContentSchema } from '@/lib/mealPlanSafety';
import { requireCurrentConsent, consentReasonMessage } from '@/lib/consentCheck';
import { checkDistributedRateLimit } from '@/lib/distributedRateLimit';
import { rateLimit } from '@/lib/ratelimit';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logSupabaseWriteFailure } from '@/lib/supabaseErrors';
import type { ChatMessage, MealPlan, MealPlanContent, NutritionQuestionnaire } from '@/types/database';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 30;

const bodySchema = z.object({
  message: z.string().min(1).max(2000),
});

// Mensagens curtas e sem conteúdo nutricional não precisam de busca
// vetorial (RAG) — economiza uma chamada de embedding + busca por
// requisição nesses casos, sem perder qualidade de resposta.
const SIMPLE_MESSAGE_PATTERN = /^(oi+|ol[aá]|obrigad[oa]s?|valeu|entendi|ok(ay)?|blz|beleza|show|legal|👍|🙏)[\s!.,]*$/i;

export async function POST(req: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Burst local (rápido) + distribuído (funciona entre instâncias Vercel).
  if (!rateLimit(`chat:${user.id}`, 30, 60)) {
    return NextResponse.json({ error: 'Muitas requisições. Aguarde um momento.' }, { status: 429 });
  }
  if (!(await checkDistributedRateLimit(`chat:${user.id}`, 30, 60))) {
    return NextResponse.json({ error: 'Muitas requisições. Aguarde um momento.' }, { status: 429 });
  }

  const consent = await requireCurrentConsent(supabase, user.id);
  if (!consent.ok) {
    return NextResponse.json({ error: consentReasonMessage(consent.reason!) }, { status: 403 });
  }

  const json = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Mensagem inválida' }, { status: 400 });
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

  const limit = PLAN_LIMITS[entitlement.plan].chatMessagesPerMonth;
  const quota = await consumeUsageQuota(user.id, 'chat', monthKey(), limit);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: featureLimitReason(entitlement.plan, 'chatMessagesPerMonth'), upgrade: entitlement.plan === 'free' },
      { status: 402 },
    );
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

  const isSimpleMessage = SIMPLE_MESSAGE_PATTERN.test(parsed.data.message.trim());
  const knowledgeChunks = isSimpleMessage ? [] : await searchKnowledge(parsed.data.message, 4, 0.55, user.id);
  const knowledgeContext = formatKnowledgeContext(knowledgeChunks);

  const systemPrompt = buildChatSystemPrompt(questionnaire, mealPlanContent, knowledgeContext);

  const historyMessages = (history ?? []).reverse().map((m) => ({
    role: m.role === 'ai' ? ('assistant' as const) : ('user' as const),
    content: m.message,
  }));

  const startedAt = Date.now();

  // chat_messages/meal_plans só aceitam escrita via service_role (RLS)
  // — ver 017_restrict_server_generated_tables.sql. Sem isso, um
  // usuário podia inserir direto pelo client SDK uma mensagem forjada
  // com role: 'ai', que depois entraria como contexto em conversas
  // futuras.
  const service = createServiceClient();

  // Obrigatória: nada mais aconteceu ainda (nenhum custo de IA
  // incorrido) — melhor falhar cedo se não conseguimos nem persistir
  // a mensagem do usuário do que gastar dinheiro numa conversa que
  // não vai ficar registrada.
  const { error: userMsgError } = await service.from('chat_messages').insert({
    user_id: user.id, role: 'user', message: parsed.data.message,
  });
  if (userMsgError) {
    console.error('[chat] falha ao salvar mensagem do usuário:', userMsgError);
    return NextResponse.json({ error: 'Não foi possível registrar sua mensagem. Tente novamente.' }, { status: 500 });
  }

  try {
    const completion = await openai.chat.completions.create({
      model: MODELS.TEXT,
      response_format: { type: 'json_object' },
      temperature: 0.7,
      max_tokens: 1200,
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMessages,
        { role: 'user', content: parsed.data.message },
      ],
    });

    await logAiUsage({
      userId: user.id,
      feature: 'chat',
      model: MODELS.TEXT,
      inputTokens: completion.usage?.prompt_tokens ?? 0,
      outputTokens: completion.usage?.completion_tokens ?? 0,
      latencyMs: Date.now() - startedAt,
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

              const { error: updateError } = await service
                .from('meal_plans')
                .update({ content: updatedContent, calories_estimate: updatedContent.total_calories ?? null })
                .eq('id', mealPlan.id);

              if (updateError) {
                // Obrigatória em espírito: não podemos dizer
                // "mealPlanUpdated: true" pro cliente se a escrita não
                // foi confirmada — isso faria a UI achar que salvou
                // quando na verdade não salvou nada.
                console.error('[chat] falha ao gravar meal_plan_update:', updateError);
                reply += '\n\n_Não consegui salvar essa alteração no seu plano agora. Tente novamente em instantes._';
              } else {
                mealPlanUpdated = true;
              }
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

    // Não bloqueante: a resposta já foi gerada e o custo de IA já foi
    // incorrido — negar a resposta ao usuário por causa de uma falha
    // em salvar o histórico seria pior sem nenhum ganho. A falha ainda
    // vira um alerta observável (ver logSupabaseWriteFailure).
    const { error: aiMsgError } = await service.from('chat_messages').insert({
      user_id: user.id, role: 'ai', message: reply,
    });
    logSupabaseWriteFailure('chat', aiMsgError);

    return NextResponse.json({ reply, mealPlanUpdated });
  } catch (err) {
    console.error('[chat] error:', (err as Error).message);
    await logAiUsage({
      userId: user.id, feature: 'chat', model: MODELS.TEXT,
      inputTokens: 0, outputTokens: 0, status: 'error', latencyMs: Date.now() - startedAt,
    });
    // A mensagem do usuário já foi salva acima — registra uma resposta
    // de erro em vez de deixar a conversa com um balão sem resposta.
    // Best-effort: já estamos no caminho de erro, uma segunda falha
    // aqui não deve impedir a resposta de erro de chegar ao cliente.
    const { error: fallbackMsgError } = await service.from('chat_messages').insert({
      user_id: user.id, role: 'ai',
      message: 'Desculpe, tive um problema para responder agora. Tente reenviar sua mensagem em instantes.',
    });
    logSupabaseWriteFailure('chat', fallbackMsgError);
    return NextResponse.json({ error: 'Falha no chat' }, { status: 500 });
  }
}

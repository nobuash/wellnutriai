import { createServiceClient } from '@/lib/supabase/service';

export type AiFeature = 'meal_plan' | 'chat' | 'photo_analysis' | 'photo_analysis_manual' | 'meal_comment' | 'embedding';

// Preços aproximados (USD por 1M tokens) — VERIFICAR contra a página de
// pricing atual da OpenAI periodicamente, isso muda com frequência e
// não há forma de buscar em tempo real sem uma chamada extra de API.
const MODEL_PRICING_USD_PER_1M: Record<string, { input: number; output: number }> = {
  'gpt-4.1-mini': { input: 0.40, output: 1.60 },
  'gpt-4o': { input: 2.50, output: 10.00 },
  'gpt-4o-mini': { input: 0.15, output: 0.60 },
  // Embeddings não têm "output" — usa 0 e conta tudo como input.
  // Preço aproximado do text-embedding-3-small.
  'text-embedding-3-small': { input: 0.02, output: 0 },
};

// Câmbio aproximado USD->BRL usado só para estimar custo em reais nos
// logs/orçamento. Configurável via env porque cotação real muda todo
// dia; não é preciso, é só para dar ordem de grandeza ao circuit
// breaker de orçamento.
const USD_BRL_RATE = Number(process.env.USD_BRL_RATE) || 5.5;

function estimateCostBRL(model: string, inputTokens: number, outputTokens: number): number {
  const pricing = MODEL_PRICING_USD_PER_1M[model];
  if (!pricing) {
    // Modelo desconhecido silenciosamente virava custo zero — o
    // circuit breaker de orçamento nunca saberia que gastou algo.
    // Loga um alerta pra alguém atualizar MODEL_PRICING_USD_PER_1M.
    console.error(`[aiUsage] ALERTA: modelo "${model}" sem preço cadastrado em MODEL_PRICING_USD_PER_1M — custo real não está sendo contabilizado no orçamento.`);
    return 0;
  }
  const usd = (inputTokens / 1_000_000) * pricing.input + (outputTokens / 1_000_000) * pricing.output;
  return usd * USD_BRL_RATE;
}

interface LogAiUsageParams {
  userId: string | null;
  feature: AiFeature;
  model: string;
  inputTokens: number;
  outputTokens: number;
  status?: 'ok' | 'error';
  latencyMs?: number;
  requestId?: string | null;
}

/**
 * Registra uso/custo de uma chamada de IA. Nunca lança — é
 * best-effort, uma falha aqui não pode derrubar a feature principal.
 * Nunca passe prompts, imagens ou texto do usuário: só metadados.
 */
export async function logAiUsage(params: LogAiUsageParams): Promise<void> {
  try {
    const service = createServiceClient();
    const totalTokens = params.inputTokens + params.outputTokens;
    const estimatedCost = estimateCostBRL(params.model, params.inputTokens, params.outputTokens);

    await service.from('ai_usage_logs').insert({
      user_id: params.userId,
      feature: params.feature,
      model: params.model,
      input_tokens: params.inputTokens,
      output_tokens: params.outputTokens,
      total_tokens: totalTokens,
      estimated_cost_brl: estimatedCost,
      status: params.status ?? 'ok',
      latency_ms: params.latencyMs ?? null,
      request_id: params.requestId ?? null,
    });
  } catch (err) {
    console.error('[aiUsage] falha ao registrar uso:', err);
  }
}

interface BudgetCheck {
  allowed: boolean;
  spentTodayBRL: number;
  dailyBudgetBRL: number | null;
}

/**
 * Circuit breaker global de gasto diário com IA. Se
 * AI_DAILY_BUDGET_BRL não estiver configurado (ou for 0), não há
 * limite — a proteção só liga quando o valor é definido
 * explicitamente, para não travar a aplicação sem aviso antes de
 * alguém decidir o orçamento.
 */
export async function checkDailyAiBudget(): Promise<BudgetCheck> {
  const dailyBudget = Number(process.env.AI_DAILY_BUDGET_BRL) || 0;
  if (dailyBudget <= 0) {
    return { allowed: true, spentTodayBRL: 0, dailyBudgetBRL: null };
  }

  try {
    const service = createServiceClient();
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);

    // Soma no Postgres (sum_ai_cost_brl), não busca linha nenhuma pro
    // Node — a versão anterior usava .select() sem paginação, que
    // trunca silenciosamente no limite padrão de 1000 linhas do
    // PostgREST em dias de uso alto, subestimando o gasto real.
    const { data: spent, error } = await service.rpc('sum_ai_cost_brl', {
      p_since: startOfDay.toISOString(),
      p_user_id: null,
    });

    if (error) throw error;

    const spentValue = Number(spent ?? 0);

    if (spentValue >= dailyBudget) {
      console.error(`[aiUsage] ALERTA: orçamento diário de IA estourado — gasto R$${spentValue.toFixed(2)} / limite R$${dailyBudget.toFixed(2)}`);
    }

    return { allowed: spentValue < dailyBudget, spentTodayBRL: spentValue, dailyBudgetBRL: dailyBudget };
  } catch (err) {
    // Falha FECHADA: um circuit breaker de orçamento que permite uso
    // quando não consegue checar o gasto deixa de proteger exatamente
    // quando mais precisaria (ex: banco fora do ar) — mesmo padrão de
    // checkDistributedRateLimit/consumeUsageQuota.
    console.error('[aiUsage] falha ao checar orçamento diário — bloqueando por segurança:', err);
    return { allowed: false, spentTodayBRL: 0, dailyBudgetBRL: dailyBudget };
  }
}

interface UserBudgetCheck {
  allowed: boolean;
  spentThisMonthBRL: number;
  monthlyBudgetBRL: number | null;
}

/**
 * Teto de gasto por usuário no mês (AI_USER_MONTHLY_BUDGET_BRL) — além
 * das cotas de contagem de uso (consumeUsageQuota), protege contra um
 * único usuário PRO gerar custo muito acima do plano paga (ex: prompts
 * anormalmente longos repetidos). Mesma regra do circuit breaker
 * diário: desligado por padrão até alguém configurar um valor.
 */
export async function checkUserMonthlyBudget(userId: string): Promise<UserBudgetCheck> {
  const monthlyBudget = Number(process.env.AI_USER_MONTHLY_BUDGET_BRL) || 0;
  if (monthlyBudget <= 0) {
    return { allowed: true, spentThisMonthBRL: 0, monthlyBudgetBRL: null };
  }

  try {
    const service = createServiceClient();
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const { data: spent, error } = await service.rpc('sum_ai_cost_brl', {
      p_since: startOfMonth.toISOString(),
      p_user_id: userId,
    });

    if (error) throw error;

    const spentValue = Number(spent ?? 0);

    return { allowed: spentValue < monthlyBudget, spentThisMonthBRL: spentValue, monthlyBudgetBRL: monthlyBudget };
  } catch (err) {
    // Falha fechada — mesmo raciocínio de checkDailyAiBudget acima.
    console.error('[aiUsage] falha ao checar orçamento mensal do usuário — bloqueando por segurança:', err);
    return { allowed: false, spentThisMonthBRL: 0, monthlyBudgetBRL: monthlyBudget };
  }
}

/**
 * Consome uma unidade de cota de uso de forma atômica via RPC
 * Postgres (consume_usage_quota) — evita a corrida de "SELECT count
 * depois INSERT" que duas requisições simultâneas poderiam furar.
 * limit < 0 = ilimitado.
 *
 * A RPC só é executável por service_role (ver
 * 013_lock_down_security_definer_rpcs.sql) — antes, qualquer usuário
 * autenticado podia chamá-la direto do client SDK com um p_user_id
 * arbitrário e esgotar a cota de outra pessoa. Por isso este helper
 * sempre usa o service client internamente.
 */
export async function consumeUsageQuota(
  userId: string,
  feature: string,
  periodKey: string,
  limit: number,
): Promise<{ allowed: boolean; currentCount: number }> {
  const service = createServiceClient();
  const { data, error } = await service
    .rpc('consume_usage_quota', {
      p_user_id: userId,
      p_feature: feature,
      p_period_key: periodKey,
      p_limit: limit,
    })
    .single<{ allowed: boolean; current_count: number }>();

  if (error || !data) {
    console.error('[aiUsage] falha ao consumir cota, bloqueando por segurança:', error);
    return { allowed: false, currentCount: 0 };
  }

  return { allowed: data.allowed, currentCount: data.current_count };
}

export function monthKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

export function dayKey(date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

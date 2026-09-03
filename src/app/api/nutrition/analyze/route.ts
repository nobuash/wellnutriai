import { MODELS, openai } from '@/lib/openai/client';
import { buildMealCommentPrompt } from '@/lib/openai/prompts';
import { extractFoodsFromPhoto } from '@/lib/nutrition/extract-from-photo';
import { extractFoodsFromText } from '@/lib/nutrition/extract-from-text';
import { calculateNutrition } from '@/lib/nutrition/calculate';
import { normalizeFood } from '@/lib/taco/normalize';
import { featureLimitReason, PLAN_LIMITS } from '@/lib/plans';
import { getUserEntitlement } from '@/lib/entitlement';
import { checkDailyAiBudget, checkUserMonthlyBudget, consumeUsageQuota, logAiUsage, monthKey } from '@/lib/aiUsage';
import { requireCurrentConsent, consentReasonMessage } from '@/lib/consentCheck';
import { checkDistributedRateLimit } from '@/lib/distributedRateLimit';
import { rateLimit } from '@/lib/ratelimit';
import { createClient } from '@/lib/supabase/server';
import { createServiceClient } from '@/lib/supabase/service';
import { logSupabaseWriteFailure } from '@/lib/supabaseErrors';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

const bodySchema = z.union([
  z.object({ mode: z.literal('text'), input: z.string().trim().min(1).max(500) }),
  z.object({ mode: z.literal('photo'), image: z.string().min(1) }),
]);

function parseImageDataUrl(dataUrl: string): { mimeType: string; buffer: Buffer } | null {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([a-zA-Z0-9+/=]+)$/.exec(dataUrl);
  if (!match) return null;
  try {
    return { mimeType: match[1], buffer: Buffer.from(match[2], 'base64') };
  } catch {
    return null;
  }
}

// Verifica magic bytes reais do arquivo (não confia no mime type da data URL)
function hasValidImageMagicBytes(buf: Buffer): boolean {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true; // JPEG
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return true; // PNG
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return true; // WebP
  return false;
}

interface NaoIdentificado {
  alimento: string;
  gramas: number;
  estimado: boolean;
  candidatos: Array<{ id: string; nome: string }>;
}

// Rota unificada de análise nutricional — substitui /api/photo-analysis
// e /api/photo-analysis/manual. Os dois modos convergem no mesmo
// pipeline a partir daqui: extração via LLM (só alimento + porção,
// nunca caloria) → normalização contra a TACO → cálculo determinístico
// em src/lib/nutrition/calculate.ts. O LLM nunca decide um valor
// nutricional.
export async function POST(req: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Burst local (rápido) + distribuído (funciona entre instâncias Vercel).
  if (!rateLimit(`nutrition-analyze:${user.id}`, 10, 3600)) {
    return NextResponse.json({ error: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });
  }
  if (!(await checkDistributedRateLimit(`nutrition-analyze:${user.id}`, 10, 3600))) {
    return NextResponse.json({ error: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });
  }

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

  // Mesmo balde de cota de sempre (photo_analysis) — é a mesma feature
  // PRO independente do modo de entrada, exatamente como já era antes
  // entre foto e manual.
  const limit = PLAN_LIMITS[entitlement.plan].photoAnalysisPerMonth;
  const quota = await consumeUsageQuota(user.id, 'photo_analysis', monthKey(), limit);
  if (!quota.allowed) {
    return NextResponse.json(
      { error: featureLimitReason(entitlement.plan, 'photoAnalysisPerMonth'), upgrade: entitlement.plan === 'free' },
      { status: 402 },
    );
  }

  const json = await req.json().catch(() => null);
  const parsedBody = bodySchema.safeParse(json);
  if (!parsedBody.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }
  const body = parsedBody.data;

  let imagePath: string | null = null;
  const startedAt = Date.now();

  try {
    let extraction: Awaited<ReturnType<typeof extractFoodsFromText>>;
    const aiFeature = body.mode === 'photo' ? 'photo_analysis' as const : 'photo_analysis_manual' as const;

    if (body.mode === 'photo') {
      const parsedImage = parseImageDataUrl(body.image);
      if (!parsedImage) {
        return NextResponse.json({ error: 'Imagem inválida' }, { status: 400 });
      }
      if (parsedImage.buffer.length > MAX_IMAGE_SIZE) {
        return NextResponse.json({ error: 'Imagem muito grande (máx 5MB)' }, { status: 400 });
      }
      if (!ALLOWED_MIME_TYPES.includes(parsedImage.mimeType) || !hasValidImageMagicBytes(parsedImage.buffer)) {
        return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 });
      }

      const ext = parsedImage.mimeType.split('/')[1];
      imagePath = `${user.id}/${Date.now()}-meal.${ext}`;
      const { error: uploadErr } = await supabase.storage
        .from('meal-photos')
        .upload(imagePath, parsedImage.buffer, { contentType: parsedImage.mimeType, upsert: false });

      if (uploadErr) {
        console.error('[nutrition/analyze] upload error:', uploadErr.message);
        return NextResponse.json({ error: 'Falha no upload' }, { status: 500 });
      }

      extraction = await extractFoodsFromPhoto(body.image);
    } else {
      extraction = await extractFoodsFromText(body.input);
    }

    await logAiUsage({
      userId: user.id,
      feature: aiFeature,
      model: body.mode === 'photo' ? MODELS.VISION : MODELS.TEXT,
      inputTokens: extraction.inputTokens,
      outputTokens: extraction.outputTokens,
      status: 'ok',
      latencyMs: Date.now() - startedAt,
    });

    // Normalização: cada item extraído vira 'matched' (segue pro
    // cálculo) ou entra em nao_identificados — nunca um valor
    // inventado (ver src/lib/taco/normalize.ts).
    const toCalculate: Array<{ tacoId: string; gramas: number; estimado: boolean }> = [];
    const naoIdentificados: NaoIdentificado[] = [];

    for (const item of extraction.items) {
      const normalized = normalizeFood(item.alimento);
      if (normalized.status === 'matched') {
        toCalculate.push({ tacoId: normalized.food.id, gramas: item.gramas, estimado: item.estimado });
      } else if (normalized.status === 'ambiguous') {
        naoIdentificados.push({
          alimento: item.alimento,
          gramas: item.gramas,
          estimado: item.estimado,
          candidatos: normalized.candidates.map((c) => ({ id: c.food.id, nome: c.food.name })),
        });
      } else {
        naoIdentificados.push({ alimento: item.alimento, gramas: item.gramas, estimado: item.estimado, candidatos: [] });
      }
    }

    const { items: calculatedItems, totals } = calculateNutrition(
      toCalculate.map(({ tacoId, gramas }) => ({ tacoId, gramas })),
    );

    const itensResposta = calculatedItems.map((item, i) => ({
      nome: item.name,
      gramas: item.gramas,
      estimado: toCalculate[i].estimado,
      kcal: item.kcal,
      proteina_g: item.proteina_g,
      carbo_g: item.carbo_g,
      gordura_g: item.gordura_g,
      fibra_g: item.fibra_g,
    }));

    // Comentário: opcional e best-effort. Recebe só os números já
    // calculados — nunca recalcula (ver buildMealCommentPrompt). Uma
    // falha aqui não derruba a resposta principal, que já está
    // completa e correta sem ele.
    let comentario: string | undefined;
    if (itensResposta.length > 0) {
      try {
        const itemsSummary = itensResposta.map((i) => `${i.nome} (${i.gramas}g)`).join(', ');
        const commentStartedAt = Date.now();
        const commentCompletion = await openai.chat.completions.create({
          model: MODELS.TEXT,
          temperature: 0.7,
          max_tokens: 200,
          messages: [{ role: 'user', content: buildMealCommentPrompt(itemsSummary, totals) }],
        });
        comentario = commentCompletion.choices[0]?.message?.content?.trim() || undefined;
        await logAiUsage({
          userId: user.id,
          feature: 'meal_comment',
          model: MODELS.TEXT,
          inputTokens: commentCompletion.usage?.prompt_tokens ?? 0,
          outputTokens: commentCompletion.usage?.completion_tokens ?? 0,
          status: 'ok',
          latencyMs: Date.now() - commentStartedAt,
        });
      } catch (commentErr) {
        console.error('[nutrition/analyze] falha ao gerar comentário (não-bloqueante):', commentErr);
      }
    }

    const result = {
      itens: itensResposta,
      totais: totals,
      fonte: 'Tabela TACO — Unicamp' as const,
      nao_identificados: naoIdentificados,
      ...(comentario ? { comentario } : {}),
    };

    // meal_photo_analysis só aceita escrita via service_role (RLS) —
    // ver 017_restrict_server_generated_tables.sql. Não-bloqueante: a
    // análise já foi feita e custou uma chamada de IA de verdade;
    // negar o resultado por causa de uma falha em salvar o histórico
    // seria pior sem nenhum ganho.
    const { data: saved, error: saveError } = await createServiceClient()
      .from('meal_photo_analysis')
      .insert({ user_id: user.id, image_url: imagePath ?? 'text', result })
      .select()
      .single();
    logSupabaseWriteFailure('nutrition-analyze', saveError);

    return NextResponse.json({ analysis: saved ?? null, result });
  } catch (err) {
    console.error('[nutrition/analyze] error:', (err as Error).message);

    // Limpa o upload se qualquer etapa depois dele falhar — sem isso o
    // arquivo fica órfão no Storage pra sempre (ver o mesmo problema,
    // ainda não corrigido, em /api/photo-analysis no histórico do projeto).
    if (imagePath) {
      const { error: removeError } = await supabase.storage.from('meal-photos').remove([imagePath]);
      if (removeError) console.error('[nutrition/analyze] falha ao limpar upload órfão:', removeError.message);
    }

    await logAiUsage({
      userId: user.id,
      feature: body.mode === 'photo' ? 'photo_analysis' : 'photo_analysis_manual',
      model: body.mode === 'photo' ? MODELS.VISION : MODELS.TEXT,
      inputTokens: 0,
      outputTokens: 0,
      status: 'error',
      latencyMs: Date.now() - startedAt,
    });
    return NextResponse.json({ error: 'Falha na análise' }, { status: 500 });
  }
}

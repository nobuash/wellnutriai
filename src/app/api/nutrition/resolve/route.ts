import { calculateNutrition } from '@/lib/nutrition/calculate';
import { requireCurrentConsent, consentReasonMessage } from '@/lib/consentCheck';
import { checkDistributedRateLimit } from '@/lib/distributedRateLimit';
import { rateLimit } from '@/lib/ratelimit';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';

const bodySchema = z.object({
  items: z.array(z.object({ tacoId: z.string().min(1), gramas: z.number().positive() })).min(1).max(20),
});

// Resolve item(ns) de "nao_identificados" depois que o usuário escolhe
// um candidato sugerido por POST /api/nutrition/analyze — sem chamar o
// LLM de novo, só busca na TACO + aritmética determinística. Por isso
// não consome cota nem orçamento de IA: não há nenhuma chamada de IA
// aqui.
export async function POST(req: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  if (!rateLimit(`nutrition-resolve:${user.id}`, 30, 3600)) {
    return NextResponse.json({ error: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });
  }
  if (!(await checkDistributedRateLimit(`nutrition-resolve:${user.id}`, 30, 3600))) {
    return NextResponse.json({ error: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });
  }

  const consent = await requireCurrentConsent(supabase, user.id);
  if (!consent.ok) {
    return NextResponse.json({ error: consentReasonMessage(consent.reason!) }, { status: 403 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  try {
    const { items, totals } = calculateNutrition(parsed.data.items);
    const itensResposta = items.map((item) => ({
      nome: item.name,
      gramas: item.gramas,
      estimado: false,
      kcal: item.kcal,
      proteina_g: item.proteina_g,
      carbo_g: item.carbo_g,
      gordura_g: item.gordura_g,
      fibra_g: item.fibra_g,
    }));

    return NextResponse.json({
      itens: itensResposta,
      totais: totals,
      fonte: 'Tabela TACO — Unicamp',
    });
  } catch (err) {
    console.error('[nutrition/resolve] error:', (err as Error).message);
    return NextResponse.json({ error: 'Alimento inválido' }, { status: 400 });
  }
}

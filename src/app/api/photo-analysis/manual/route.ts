import { MODELS, openai } from '@/lib/openai/client';
import { MANUAL_ANALYSIS_PROMPT } from '@/lib/openai/prompts';
import { canUseFeature } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';
import { z } from 'zod';

export const runtime = 'nodejs';
export const maxDuration = 30;

const bodySchema = z.object({
  foods: z
    .array(z.object({ name: z.string().min(1), grams: z.number().positive() }))
    .min(1)
    .max(20),
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

  const check = canUseFeature(profile.plan, 'photoAnalysis');
  if (!check.allowed) {
    return NextResponse.json({ error: check.reason, upgrade: true }, { status: 402 });
  }

  const json = await req.json().catch(() => null);
  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json({ error: 'Dados inválidos' }, { status: 400 });
  }

  const foodsList = parsed.data.foods
    .map((f) => `- ${f.name}: ${f.grams}g`)
    .join('\n');

  try {
    const completion = await openai.chat.completions.create({
      model: MODELS.TEXT,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'Retorne apenas JSON válido conforme instruções.' },
        {
          role: 'user',
          content: `${MANUAL_ANALYSIS_PROMPT}\n\nAlimentos informados:\n${foodsList}`,
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('IA não retornou conteúdo');

    const result = JSON.parse(raw);

    // Salva no histórico reutilizando a mesma tabela
    await supabase.from('meal_photo_analysis').insert({
      user_id: user.id,
      image_url: 'manual', // sem foto
      result,
    });

    return NextResponse.json({ result });
  } catch (err) {
    console.error('[photo-analysis/manual] error:', err);
    return NextResponse.json({ error: 'Falha na análise' }, { status: 500 });
  }
}

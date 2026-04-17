import { MODELS, openai } from '@/lib/openai/client';
import { PHOTO_ANALYSIS_PROMPT } from '@/lib/openai/prompts';
import { canUseFeature } from '@/lib/plans';
import { createClient } from '@/lib/supabase/server';
import type { PhotoAnalysisResult } from '@/types/database';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED = ['image/jpeg', 'image/png', 'image/webp'];

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
    return NextResponse.json(
      { error: check.reason, upgrade: true },
      { status: 402 }
    );
  }

  const form = await req.formData();
  const file = form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Imagem não enviada' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Imagem muito grande (máx 5MB)' }, { status: 400 });
  }
  if (!ALLOWED.includes(file.type)) {
    return NextResponse.json({ error: 'Formato inválido (use JPEG, PNG ou WebP)' }, { status: 400 });
  }

  try {
    // Upload no storage (path namespaced pelo user.id — RLS exige)
    const path = `${user.id}/${Date.now()}-${file.name.replace(/[^a-z0-9.]/gi, '_')}`;
    const { error: uploadErr } = await supabase.storage
      .from('meal-photos')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadErr) {
      console.error('[photo] upload error:', uploadErr);
      return NextResponse.json({ error: 'Falha no upload' }, { status: 500 });
    }

    // URL assinada (bucket é privado)
    const { data: signed } = await supabase.storage
      .from('meal-photos')
      .createSignedUrl(path, 60 * 60);

    // Envia imagem em base64 para OpenAI Vision (evita dependência da URL assinada expirada)
    const buf = Buffer.from(await file.arrayBuffer());
    const b64 = `data:${file.type};base64,${buf.toString('base64')}`;

    const completion = await openai.chat.completions.create({
      model: MODELS.VISION,
      response_format: { type: 'json_object' },
      temperature: 0.3,
      messages: [
        { role: 'system', content: 'Retorne apenas JSON válido conforme instruções.' },
        {
          role: 'user',
          content: [
            { type: 'text', text: PHOTO_ANALYSIS_PROMPT },
            { type: 'image_url', image_url: { url: b64 } },
          ],
        },
      ],
    });

    const raw = completion.choices[0]?.message?.content;
    if (!raw) throw new Error('IA não retornou conteúdo');

    const result = JSON.parse(raw) as PhotoAnalysisResult;

    const { data: saved } = await supabase
      .from('meal_photo_analysis')
      .insert({
        user_id: user.id,
        image_url: signed?.signedUrl ?? path,
        result,
      })
      .select()
      .single();

    return NextResponse.json({ analysis: saved, result });
  } catch (err) {
    console.error('[photo] error:', err);
    return NextResponse.json({ error: 'Falha na análise' }, { status: 500 });
  }
}

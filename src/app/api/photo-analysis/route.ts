import { MODELS, openai } from '@/lib/openai/client';
import { PHOTO_ANALYSIS_PROMPT } from '@/lib/openai/prompts';
import { canUseFeature } from '@/lib/plans';
import { rateLimit } from '@/lib/ratelimit';
import { createClient } from '@/lib/supabase/server';
import type { PhotoAnalysisResult } from '@/types/database';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const maxDuration = 60;

const MAX_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

// Verifica magic bytes reais do arquivo (não confia no Content-Type do browser)
async function validateImageMagicBytes(file: File): Promise<boolean> {
  const buf = Buffer.from(await file.slice(0, 12).arrayBuffer());

  // JPEG: FF D8 FF
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return true;

  // PNG: 89 50 4E 47 0D 0A 1A 0A
  if (
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return true;

  // WebP: RIFF????WEBP
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 &&
    buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) return true;

  return false;
}

export async function POST(req: Request) {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  // Rate limit: 10 uploads por hora por usuário
  if (!rateLimit(`photo:${user.id}`, 10, 3600)) {
    return NextResponse.json({ error: 'Muitas requisições. Tente novamente em breve.' }, { status: 429 });
  }

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

  const form = await req.formData();
  const file = form.get('image');
  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'Imagem não enviada' }, { status: 400 });
  }
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'Imagem muito grande (máx 5MB)' }, { status: 400 });
  }
  if (!ALLOWED_TYPES.includes(file.type)) {
    return NextResponse.json({ error: 'Formato inválido (use JPEG, PNG ou WebP)' }, { status: 400 });
  }

  // Valida magic bytes reais — impede arquivos disfarçados com Content-Type falso
  const isRealImage = await validateImageMagicBytes(file);
  if (!isRealImage) {
    return NextResponse.json({ error: 'Arquivo inválido' }, { status: 400 });
  }

  try {
    // Salva com nome seguro: sem caracteres especiais, prefixado pelo user.id
    const safeName = file.name.replace(/[^a-z0-9.]/gi, '_').slice(0, 80);
    const path = `${user.id}/${Date.now()}-${safeName}`;

    const { error: uploadErr } = await supabase.storage
      .from('meal-photos')
      .upload(path, file, { contentType: file.type, upsert: false });

    if (uploadErr) {
      console.error('[photo] upload error:', uploadErr.message);
      return NextResponse.json({ error: 'Falha no upload' }, { status: 500 });
    }

    const { data: signed } = await supabase.storage
      .from('meal-photos')
      .createSignedUrl(path, 60 * 60);

    // Envia em base64 para OpenAI Vision (evita dependência da URL assinada)
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
      .insert({ user_id: user.id, image_url: signed?.signedUrl ?? path, result })
      .select()
      .single();

    return NextResponse.json({ analysis: saved, result });
  } catch (err) {
    console.error('[photo] error:', (err as Error).message);
    return NextResponse.json({ error: 'Falha na análise' }, { status: 500 });
  }
}

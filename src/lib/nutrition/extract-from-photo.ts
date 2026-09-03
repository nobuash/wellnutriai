import { MODELS, openai } from '@/lib/openai/client';
import { FOOD_EXTRACTION_FROM_PHOTO_PROMPT } from '@/lib/openai/prompts';
import { extractionResponseSchema, type ExtractionResult } from './types';

/**
 * Extrai [{alimento, gramas, estimado}] de uma foto de refeição —
 * mesmo formato de saída de extract-from-text.ts, pra alimentar o
 * mesmo pipeline de normalização + cálculo. NUNCA retorna
 * caloria/macro (ver a regra crítica no topo de
 * src/lib/openai/prompts.ts).
 *
 * `imageDataUrl` precisa ser uma data URL completa
 * ("data:image/jpeg;base64,...") — quem chama já validou tipo/tamanho
 * do arquivo antes (ver src/app/api/nutrition/analyze/route.ts).
 */
export async function extractFoodsFromPhoto(imageDataUrl: string): Promise<ExtractionResult> {
  const completion = await openai.chat.completions.create({
    model: MODELS.VISION,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 600,
    messages: [
      { role: 'system', content: 'Você retorna apenas JSON válido conforme instruções.' },
      {
        role: 'user',
        content: [
          { type: 'text', text: FOOD_EXTRACTION_FROM_PHOTO_PROMPT },
          { type: 'image_url', image_url: { url: imageDataUrl } },
        ],
      },
    ],
  });

  const inputTokens = completion.usage?.prompt_tokens ?? 0;
  const outputTokens = completion.usage?.completion_tokens ?? 0;

  const raw = completion.choices[0]?.message?.content;
  if (!raw) throw new Error('IA não retornou conteúdo');

  const parsed = extractionResponseSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(`Resposta da IA fora do schema esperado: ${parsed.error.message}`);
  }

  // Modo foto: todo item é necessariamente uma estimativa — força aqui
  // em vez de confiar 100% na instrução do prompt.
  const items = parsed.data.items.map((item) => ({ ...item, estimado: true }));

  return { items, inputTokens, outputTokens };
}

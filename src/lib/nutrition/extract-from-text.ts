import { MODELS, openai } from '@/lib/openai/client';
import { buildFoodExtractionFromTextPrompt } from '@/lib/openai/prompts';
import { extractionResponseSchema, type ExtractionResult } from './types';

/**
 * Extrai [{alimento, gramas, estimado}] de uma descrição em texto
 * livre. NUNCA retorna caloria/macro — só identificação de alimento e
 * porção (ver a regra crítica no topo de src/lib/openai/prompts.ts).
 * O valor nutricional vem depois, de src/lib/nutrition/calculate.ts.
 */
export async function extractFoodsFromText(input: string): Promise<ExtractionResult> {
  const completion = await openai.chat.completions.create({
    model: MODELS.TEXT,
    response_format: { type: 'json_object' },
    temperature: 0.2,
    max_tokens: 600,
    messages: [
      { role: 'system', content: 'Você retorna apenas JSON válido conforme instruções.' },
      { role: 'user', content: buildFoodExtractionFromTextPrompt(input) },
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

  return { items: parsed.data.items, inputTokens, outputTokens };
}

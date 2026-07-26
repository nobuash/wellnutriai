import { logAiUsage } from '@/lib/aiUsage';
import { openai } from '@/lib/openai/client';

/**
 * Gera embedding de um texto usando text-embedding-3-small (1536 dimensões).
 * Usado tanto na busca semântica quanto na ingestão de documentos.
 *
 * userId é opcional (a ingestão de documentos roda fora do contexto de
 * um usuário) — quando ausente, o custo ainda é registrado (userId
 * null), só não é atribuído a ninguém especificamente. Antes, chamadas
 * de embedding não eram registradas em lugar nenhum: todo request de
 * chat/plano alimentar fazia pelo menos uma chamada de embedding sem
 * que esse custo entrasse no orçamento diário/mensal.
 */
export async function generateEmbedding(text: string, userId: string | null = null): Promise<number[]> {
  // Trunca para 8000 chars para não exceder o limite do modelo
  const input = text.slice(0, 8000).replace(/\n+/g, ' ').trim();

  const startedAt = Date.now();
  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input,
  });

  await logAiUsage({
    userId,
    feature: 'embedding',
    model: 'text-embedding-3-small',
    inputTokens: response.usage?.total_tokens ?? 0,
    outputTokens: 0,
    latencyMs: Date.now() - startedAt,
  });

  return response.data[0].embedding;
}

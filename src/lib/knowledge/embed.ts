import { openai } from '@/lib/openai/client';

/**
 * Gera embedding de um texto usando text-embedding-3-small (1536 dimensões).
 * Usado tanto na busca semântica quanto na ingestão de documentos.
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  // Trunca para 8000 chars para não exceder o limite do modelo
  const input = text.slice(0, 8000).replace(/\n+/g, ' ').trim();

  const response = await openai.embeddings.create({
    model: 'text-embedding-3-small',
    input,
  });

  return response.data[0].embedding;
}

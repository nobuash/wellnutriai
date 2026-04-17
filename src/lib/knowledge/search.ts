import { createClient } from '@/lib/supabase/server';
import { generateEmbedding } from './embed';

export interface KnowledgeResult {
  id: string;
  source_name: string;
  source_type: string;
  content: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

/**
 * Busca os chunks mais relevantes da base de conhecimento
 * usando similaridade de cosseno (pgvector).
 */
export async function searchKnowledge(
  query: string,
  matchCount = 4,
  matchThreshold = 0.55,
): Promise<KnowledgeResult[]> {
  try {
    const supabase = createClient();
    const embedding = await generateEmbedding(query);

    const { data, error } = await supabase.rpc('match_knowledge_chunks', {
      query_embedding: embedding,
      match_threshold: matchThreshold,
      match_count: matchCount,
    });

    if (error) {
      console.error('[knowledge] search error:', error.message);
      return [];
    }

    return (data ?? []) as KnowledgeResult[];
  } catch (err) {
    // Falha silenciosa: a IA responde sem contexto adicional
    console.error('[knowledge] unexpected error:', err);
    return [];
  }
}

/**
 * Formata os chunks encontrados como bloco de contexto
 * para ser injetado no system prompt da IA.
 */
export function formatKnowledgeContext(chunks: KnowledgeResult[]): string {
  if (chunks.length === 0) return '';

  const sources = chunks
    .map(
      (c, i) =>
        `### Fonte ${i + 1}: ${c.source_name} (${c.source_type})\n${c.content}`,
    )
    .join('\n\n---\n\n');

  return `## EMBASAMENTO CIENTÍFICO (use como referência, não cite diretamente)\n\n${sources}`;
}

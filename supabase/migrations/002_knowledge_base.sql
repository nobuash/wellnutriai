-- =====================================================================
-- WellNutriAI - Base de conhecimento com pgvector (RAG)
-- Execute este arquivo no SQL Editor do Supabase
-- =====================================================================

-- 1. Ativa a extensão pgvector (necessário uma vez por projeto)
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. Tabela de chunks de documentos
CREATE TABLE IF NOT EXISTS public.knowledge_chunks (
  id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  source_name TEXT        NOT NULL,           -- ex: "Guia de Nutrição Esportiva 2024"
  source_type TEXT        NOT NULL DEFAULT 'article'
                          CHECK (source_type IN ('ebook', 'article', 'guideline', 'other')),
  content     TEXT        NOT NULL,           -- trecho do texto (~500 palavras)
  embedding   VECTOR(1536),                   -- text-embedding-3-small da OpenAI
  metadata    JSONB       DEFAULT '{}',       -- dados extras (autor, ano, página, etc.)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Índice IVFFLAT para busca aproximada por cosseno (rápida em grandes volumes)
CREATE INDEX IF NOT EXISTS knowledge_chunks_embedding_idx
  ON public.knowledge_chunks
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- 3. Função de busca semântica por similaridade de cosseno
CREATE OR REPLACE FUNCTION match_knowledge_chunks(
  query_embedding VECTOR(1536),
  match_threshold FLOAT   DEFAULT 0.6,
  match_count     INT     DEFAULT 5
)
RETURNS TABLE (
  id          UUID,
  source_name TEXT,
  source_type TEXT,
  content     TEXT,
  metadata    JSONB,
  similarity  FLOAT
)
LANGUAGE sql STABLE
AS $$
  SELECT
    kc.id,
    kc.source_name,
    kc.source_type,
    kc.content,
    kc.metadata,
    1 - (kc.embedding <=> query_embedding) AS similarity
  FROM public.knowledge_chunks kc
  WHERE kc.embedding IS NOT NULL
    AND 1 - (kc.embedding <=> query_embedding) > match_threshold
  ORDER BY kc.embedding <=> query_embedding
  LIMIT match_count;
$$;

-- 4. RLS: knowledge_chunks é conteúdo público para usuários autenticados
ALTER TABLE public.knowledge_chunks ENABLE ROW LEVEL SECURITY;

-- Leitura: qualquer usuário autenticado pode consultar
DROP POLICY IF EXISTS "knowledge_chunks_select_authenticated" ON public.knowledge_chunks;
CREATE POLICY "knowledge_chunks_select_authenticated"
  ON public.knowledge_chunks
  FOR SELECT
  USING (auth.role() = 'authenticated');

-- Inserção/Deleção: apenas service_role (via script de ingestão com SERVICE KEY)
-- Não é necessário criar policy explícita para service_role, pois ele ignora RLS.

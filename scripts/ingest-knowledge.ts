/**
 * Script de ingestão de documentos para a base de conhecimento RAG.
 *
 * Como usar:
 *   1. Coloque seus arquivos (.txt, .md ou .pdf) na pasta /knowledge
 *   2. Execute: npm run ingest
 *
 * Para PDFs, instale: npm install -D pdf-parse @types/pdf-parse
 *
 * Variáveis de ambiente necessárias (.env.local):
 *   OPENAI_API_KEY
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY   ← chave de service_role (NÃO a anon key)
 */

import fs from 'fs';
import path from 'path';
import { createClient } from '@supabase/supabase-js';
import OpenAI from 'openai';

// ── Carrega variáveis de ambiente do .env.local ─────────────────────────────
function loadEnv() {
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (!fs.existsSync(envPath)) {
    throw new Error('.env.local não encontrado. Crie o arquivo na raiz do projeto.');
  }
  const lines = fs.readFileSync(envPath, 'utf-8').split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const value = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
    if (!process.env[key]) process.env[key] = value;
  }
}

loadEnv();

const OPENAI_API_KEY = process.env.OPENAI_API_KEY!;
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!OPENAI_API_KEY || !SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('❌ Variáveis de ambiente ausentes: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}

const openai = new OpenAI({ apiKey: OPENAI_API_KEY });
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

// ── Configurações ────────────────────────────────────────────────────────────
const KNOWLEDGE_DIR = path.resolve(process.cwd(), 'knowledge');
const CHUNK_SIZE = 500;      // palavras por chunk
const CHUNK_OVERLAP = 50;    // palavras de sobreposição entre chunks
const EMBEDDING_MODEL = 'text-embedding-3-small';

// ── Chunking de texto ────────────────────────────────────────────────────────
function chunkText(text: string): string[] {
  // Divide por parágrafos primeiro
  const paragraphs = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.replace(/\s+/g, ' ').trim())
    .filter((p) => p.length > 30);

  const chunks: string[] = [];
  let currentWords: string[] = [];

  for (const paragraph of paragraphs) {
    const words = paragraph.split(' ');

    for (const word of words) {
      currentWords.push(word);

      if (currentWords.length >= CHUNK_SIZE) {
        chunks.push(currentWords.join(' '));
        // Mantém sobreposição para contexto contínuo
        currentWords = currentWords.slice(-CHUNK_OVERLAP);
      }
    }
  }

  // Último chunk
  if (currentWords.length > 20) {
    chunks.push(currentWords.join(' '));
  }

  return chunks;
}

// ── Leitura de arquivos ──────────────────────────────────────────────────────
async function readFile(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.txt' || ext === '.md') {
    return fs.readFileSync(filePath, 'utf-8');
  }

  if (ext === '.pdf') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const pdfParse = require('pdf-parse');
      const buffer = fs.readFileSync(filePath);
      const data = await pdfParse(buffer);
      return data.text as string;
    } catch {
      console.error(`  ⚠️  pdf-parse não instalado. Execute: npm install -D pdf-parse`);
      console.error(`  ⚠️  Pulando arquivo: ${filePath}`);
      return '';
    }
  }

  console.warn(`  ⚠️  Formato não suportado: ${ext}. Use .txt, .md ou .pdf`);
  return '';
}

// ── Geração de embedding ─────────────────────────────────────────────────────
async function generateEmbedding(text: string): Promise<number[]> {
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: text.slice(0, 8000).replace(/\n+/g, ' ').trim(),
  });
  return response.data[0].embedding;
}

// ── Determina source_type pelo nome do arquivo ───────────────────────────────
function inferSourceType(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.includes('ebook') || lower.includes('livro') || lower.includes('book')) return 'ebook';
  if (lower.includes('artigo') || lower.includes('article') || lower.includes('estudo')) return 'article';
  if (lower.includes('guideline') || lower.includes('diretriz') || lower.includes('protocolo')) return 'guideline';
  return 'other';
}

// ── Processa um arquivo ──────────────────────────────────────────────────────
async function processFile(filePath: string) {
  const filename = path.basename(filePath);
  const sourceName = path.basename(filename, path.extname(filename))
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
  const sourceType = inferSourceType(filename);

  console.log(`\n📄 Processando: ${filename}`);
  console.log(`   Nome: ${sourceName} | Tipo: ${sourceType}`);

  const text = await readFile(filePath);
  if (!text.trim()) {
    console.log('   ⚠️  Arquivo vazio ou não lido. Pulando.');
    return;
  }

  const chunks = chunkText(text);
  console.log(`   ✂️  ${chunks.length} chunks gerados`);

  // Remove chunks antigos desta fonte
  const { error: deleteError } = await supabase
    .from('knowledge_chunks')
    .delete()
    .eq('source_name', sourceName);

  if (deleteError) {
    console.error('   ❌ Erro ao limpar chunks antigos:', deleteError.message);
  }

  let saved = 0;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    process.stdout.write(`   ⚡ Embedding ${i + 1}/${chunks.length}...\r`);

    try {
      const embedding = await generateEmbedding(chunk);

      const { error } = await supabase.from('knowledge_chunks').insert({
        source_name: sourceName,
        source_type: sourceType,
        content: chunk,
        embedding,
        metadata: { filename, chunk_index: i, total_chunks: chunks.length },
      });

      if (error) throw error;
      saved++;
    } catch (err) {
      console.error(`\n   ❌ Erro no chunk ${i + 1}:`, err);
    }

    // Pequena pausa para não exceder rate limit da OpenAI
    await new Promise((r) => setTimeout(r, 100));
  }

  console.log(`\n   ✅ ${saved}/${chunks.length} chunks salvos com sucesso`);
}

// ── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🧠 WellNutriAI — Ingestão de Base de Conhecimento');
  console.log('='.repeat(50));

  if (!fs.existsSync(KNOWLEDGE_DIR)) {
    console.error(`❌ Pasta /knowledge não encontrada. Crie-a na raiz do projeto.`);
    process.exit(1);
  }

  const files = fs.readdirSync(KNOWLEDGE_DIR).filter((f) =>
    ['.txt', '.md', '.pdf'].includes(path.extname(f).toLowerCase())
  );

  if (files.length === 0) {
    console.log('⚠️  Nenhum arquivo encontrado em /knowledge');
    console.log('   Coloque arquivos .txt, .md ou .pdf na pasta /knowledge e rode novamente.');
    process.exit(0);
  }

  console.log(`\n📚 ${files.length} arquivo(s) encontrado(s):`);
  files.forEach((f) => console.log(`   - ${f}`));

  for (const file of files) {
    await processFile(path.join(KNOWLEDGE_DIR, file));
  }

  console.log('\n' + '='.repeat(50));
  console.log('✅ Ingestão concluída! A IA já pode usar o conhecimento.');
}

main().catch((err) => {
  console.error('❌ Erro fatal:', err);
  process.exit(1);
});

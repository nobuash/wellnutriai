import Fuse from 'fuse.js';
import { TACO_FOODS } from './data';
import type { TacoFood } from './types';

const STOPWORDS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'sem', 'um', 'uma', 'a', 'o', 'ao', 'em']);

function normalizeText(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // remove acentos
    .trim();
}

function tokenize(s: string): string[] {
  return normalizeText(s)
    .replace(/[,.;()]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0 && !STOPWORDS.has(t));
}

interface SearchEntry {
  term: string;
  food: TacoFood;
}

// Cada alimento entra no índice de fuzzy uma vez por nome oficial + uma
// vez por apelido, todos apontando pro mesmo TacoFood.
const searchEntries: SearchEntry[] = TACO_FOODS.flatMap((food) => [
  { term: food.name, food },
  ...food.aliases.map((alias) => ({ term: alias, food })),
]);

// Match exato/por apelido é O(1) e sempre tem prioridade — "arroz" não
// deveria depender de score de similaridade quando já é literalmente
// um apelido cadastrado.
const exactIndex = new Map<string, TacoFood>();
for (const food of TACO_FOODS) {
  exactIndex.set(normalizeText(food.name), food);
  for (const alias of food.aliases) exactIndex.set(normalizeText(alias), food);
}

// Conjunto de tokens (nome + todos os apelidos) por alimento — resolve
// o caso que fuzzy char-a-char sozinho erra: ordem de palavras
// diferente ou palavra extra ("peito de frango grelhado" vs "Frango,
// peito, grelhado" — mesmas 3 palavras, ordem e pontuação diferentes).
const tokensByFoodId = new Map<string, Set<string>>();
for (const food of TACO_FOODS) {
  const tokens = [food.name, ...food.aliases].flatMap(tokenize);
  tokensByFoodId.set(food.id, new Set(tokens));
}

const fuse = new Fuse(searchEntries, {
  keys: ['term'],
  includeScore: true,
  threshold: 0.6,
  ignoreLocation: true,
});

// Score final por alimento é o MELHOR entre dois sinais independentes
// (0 = nada em comum, 1 = perfeito):
// - tokenScore: fração das palavras da query que aparecem literalmente
//   entre os tokens do alimento, em qualquer ordem — forte pra frases
//   com palavras reordenadas/adicionadas, fraco pra erro de digitação
//   (um token com typo simplesmente não bate com nada).
// - charScore: similaridade char-a-char do Fuse contra o melhor termo
//   (nome ou apelido) do alimento — forte pra erro de digitação, fraco
//   quando a ordem das palavras muda muito.
// Nenhum dos dois sozinho cobre os dois casos; o máximo entre eles cobre.
const MATCH_THRESHOLD = 0.8;
const CANDIDATE_MIN_SCORE = 0.35;
const MAX_CANDIDATES = 3;

function tokenOverlapRatio(queryTokens: string[], foodTokens: Set<string>): number {
  if (queryTokens.length === 0) return 0;
  const matched = queryTokens.filter((t) => foodTokens.has(t)).length;
  return matched / queryTokens.length;
}

export type NormalizeResult =
  | { status: 'matched'; food: TacoFood; confidence: number }
  | { status: 'ambiguous'; candidates: Array<{ food: TacoFood; confidence: number }> }
  | { status: 'not_found' };

/**
 * Resolve uma string livre (do usuário ou extraída pelo LLM) pro
 * alimento correspondente na TACO. Nunca inventa um match: fora do
 * caso 'matched' com um único vencedor claro, quem chama precisa
 * decidir o que fazer (pedir desambiguação, ou reportar como não
 * identificado) — normalizeFood em si nunca "chuta".
 */
export function normalizeFood(query: string): NormalizeResult {
  const normalized = normalizeText(query);
  if (!normalized) return { status: 'not_found' };

  const exact = exactIndex.get(normalized);
  if (exact) return { status: 'matched', food: exact, confidence: 1 };

  const queryTokens = tokenize(query);

  const fuseScoreByFoodId = new Map<string, number>();
  for (const r of fuse.search(normalized)) {
    const charScore = 1 - (r.score ?? 1);
    const existing = fuseScoreByFoodId.get(r.item.food.id) ?? 0;
    if (charScore > existing) fuseScoreByFoodId.set(r.item.food.id, charScore);
  }

  const candidateFoodIds = new Set(fuseScoreByFoodId.keys());
  if (queryTokens.length > 0) {
    for (const [foodId, tokens] of tokensByFoodId) {
      if (tokenOverlapRatio(queryTokens, tokens) > 0) candidateFoodIds.add(foodId);
    }
  }

  const scored = [...candidateFoodIds]
    .map((foodId) => {
      const food = TACO_FOODS.find((f) => f.id === foodId)!;
      const tokenScore = tokenOverlapRatio(queryTokens, tokensByFoodId.get(foodId)!);
      const charScore = fuseScoreByFoodId.get(foodId) ?? 0;
      return { food, score: Math.max(tokenScore, charScore) };
    })
    .sort((a, b) => b.score - a.score);

  if (scored.length === 0) return { status: 'not_found' };

  const best = scored[0];
  if (best.score >= MATCH_THRESHOLD) {
    // Mais de um alimento empatado no topo (ex: query "frango" bate
    // 100% dos tokens de vários itens de frango diferentes) — não
    // decide sozinho, vira desambiguação.
    const tiedAtBest = scored.filter((s) => s.score >= best.score - 0.001);
    if (tiedAtBest.length === 1) {
      return { status: 'matched', food: best.food, confidence: best.score };
    }
    return {
      status: 'ambiguous',
      candidates: tiedAtBest.slice(0, MAX_CANDIDATES).map((s) => ({ food: s.food, confidence: s.score })),
    };
  }

  const candidates = scored
    .filter((s) => s.score >= CANDIDATE_MIN_SCORE)
    .slice(0, MAX_CANDIDATES)
    .map((s) => ({ food: s.food, confidence: s.score }));

  if (candidates.length === 0) return { status: 'not_found' };

  return { status: 'ambiguous', candidates };
}

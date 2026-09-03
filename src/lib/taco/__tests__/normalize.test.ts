import { describe, expect, it } from 'vitest';
import { normalizeFood } from '@/lib/taco/normalize';

describe('normalizeFood — match exato', () => {
  it('encontra pelo nome oficial exato', () => {
    const result = normalizeFood('Arroz branco cozido');
    expect(result.status).toBe('matched');
    if (result.status === 'matched') {
      expect(result.food.id).toBe('arroz-branco-cozido');
      expect(result.confidence).toBe(1);
    }
  });

  it('ignora maiúsculas/acentos ao comparar', () => {
    const result = normalizeFood('ARROZ BRANCO COZIDO');
    expect(result.status).toBe('matched');
  });

  it('encontra por apelido popular ("arroz" -> arroz branco cozido)', () => {
    const result = normalizeFood('arroz');
    expect(result.status).toBe('matched');
    if (result.status === 'matched') expect(result.food.id).toBe('arroz-branco-cozido');
  });

  it('resolve "miojo" para macarrão instantâneo, o exemplo citado no pedido', () => {
    const result = normalizeFood('miojo');
    expect(result.status).toBe('matched');
    if (result.status === 'matched') expect(result.food.id).toBe('macarrao-instantaneo-miojo');
  });

  it('resolve "peito de frango" para o frango grelhado', () => {
    const result = normalizeFood('peito de frango');
    expect(result.status).toBe('matched');
    if (result.status === 'matched') expect(result.food.id).toBe('frango-peito-grelhado');
  });
});

describe('normalizeFood — robustez a ordem de palavras (regressão)', () => {
  it('encontra mesmo com palavra extra e ordem diferente da forma cadastrada', () => {
    // "Frango, peito, grelhado" é o nome oficial — isto prova que
    // fuzzy char-a-char sozinho (Fuse.js puro) não bastava aqui: o
    // score dele pra essa combinação específica ficava pior que o
    // limiar de match. A comparação por tokens (normalize.ts) resolve.
    const result = normalizeFood('peito de frango grelhado');
    expect(result.status).toBe('matched');
    if (result.status === 'matched') expect(result.food.id).toBe('frango-peito-grelhado');
  });

  it('a ordem das palavras não importa', () => {
    const result = normalizeFood('frango grelhado peito');
    expect(result.status).toBe('matched');
    if (result.status === 'matched') expect(result.food.id).toBe('frango-peito-grelhado');
  });
});

describe('normalizeFood — busca fuzzy (erro de digitação)', () => {
  it('tolera uma letra faltando', () => {
    const result = normalizeFood('frngo grelhado');
    expect(['matched', 'ambiguous']).toContain(result.status);
    if (result.status === 'matched') expect(result.food.id).toBe('frango-peito-grelhado');
    if (result.status === 'ambiguous') {
      expect(result.candidates.some((c) => c.food.id === 'frango-peito-grelhado')).toBe(true);
    }
  });

  it('tolera falta de acentuação em nome com acento', () => {
    const result = normalizeFood('mamao');
    expect(result.status).not.toBe('not_found');
  });
});

describe('normalizeFood — não encontrado', () => {
  it('retorna not_found para texto sem nenhuma relação com alimentos', () => {
    const result = normalizeFood('xyzabc123qwerty');
    expect(result.status).toBe('not_found');
  });

  it('retorna not_found para string vazia', () => {
    expect(normalizeFood('').status).toBe('not_found');
    expect(normalizeFood('   ').status).toBe('not_found');
  });
});

describe('normalizeFood — nunca "chuta" um resultado de baixa confiança', () => {
  it('um match ambíguo sempre traz no máximo 3 candidatos, nunca decide sozinho', () => {
    // "carne" sozinho pode plausivelmente ser várias entradas de carne
    // bovina/suína cadastradas — não deve ser resolvido como 'matched'
    // silenciosamente para uma delas.
    const result = normalizeFood('carne vermelha bem temperada');
    if (result.status === 'ambiguous') {
      expect(result.candidates.length).toBeGreaterThan(0);
      expect(result.candidates.length).toBeLessThanOrEqual(3);
    } else {
      // Aceitável também não achar nada — o que NUNCA pode acontecer é
      // decidir sozinho por uma carne específica com esse texto vago.
      expect(result.status).not.toBe('matched');
    }
  });
});

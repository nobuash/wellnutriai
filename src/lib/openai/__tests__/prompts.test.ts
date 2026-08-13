import { describe, expect, it } from 'vitest';
import { buildChatSystemPrompt } from '@/lib/openai/prompts';
import type { NutritionQuestionnaire } from '@/types/database';

function questionnaire(overrides: Partial<NutritionQuestionnaire> = {}): NutritionQuestionnaire {
  return {
    id: 'q1',
    user_id: 'u1',
    age: 30,
    weight: 80,
    height: 180,
    body_fat: null,
    biological_sex: 'male',
    goal: 'maintain',
    activity_level: 'moderate',
    diabetes_type: 'none',
    allergies: [],
    dietary_preferences: [],
    disliked_foods: [],
    meals_per_day: 4,
    routine: null,
    is_pregnant: false,
    is_breastfeeding: false,
    has_kidney_disease: false,
    has_liver_disease: false,
    has_eating_disorder_history: false,
    has_severe_allergy: false,
    uses_insulin: false,
    other_medical_condition: null,
    created_at: '2026-01-01T00:00:00Z',
    ...overrides,
  };
}

describe('buildChatSystemPrompt — modo restrito', () => {
  it('não inclui o bloco de modo restrito para um questionário sem condição de risco', () => {
    const prompt = buildChatSystemPrompt(questionnaire(), null);
    expect(prompt).not.toContain('MODO RESTRITO ATIVO');
  });

  it('inclui o bloco de modo restrito para diabetes', () => {
    const prompt = buildChatSystemPrompt(questionnaire({ diabetes_type: 'type2' }), null);
    expect(prompt).toContain('MODO RESTRITO ATIVO');
    expect(prompt).toContain('NUNCA faça esse fluxo de edição');
  });

  it('inclui o bloco de modo restrito para gestação, mesmo sem diabetes', () => {
    const prompt = buildChatSystemPrompt(questionnaire({ is_pregnant: true }), null);
    expect(prompt).toContain('MODO RESTRITO ATIVO');
  });

  it('não inclui o bloco de modo restrito quando não há questionário', () => {
    const prompt = buildChatSystemPrompt(null, null);
    expect(prompt).not.toContain('MODO RESTRITO ATIVO');
  });

  it('a decisão vem só do questionário — o texto da conversa em si não é considerado aqui', () => {
    // buildChatSystemPrompt não recebe o histórico/mensagem do usuário
    // como entrada de decisão — só o questionário. Isso é o que
    // garante que o modo não dependa de o usuário "lembrar" de repetir
    // a condição na conversa.
    const restricted = buildChatSystemPrompt(questionnaire({ has_severe_allergy: true }), null);
    const standard = buildChatSystemPrompt(questionnaire(), null);
    expect(restricted).toContain('MODO RESTRITO ATIVO');
    expect(standard).not.toContain('MODO RESTRITO ATIVO');
  });
});

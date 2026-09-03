import { describe, expect, it } from 'vitest';
import { questionnaireSchema } from '@/lib/validation';

const BASE_INPUT = {
  age: 25,
  weight: 70,
  height: 175,
  body_fat: null,
  biological_sex: 'female' as const,
  goal: 'maintain' as const,
  activity_level: 'moderate' as const,
  diabetes_type: 'none' as const,
  allergies: [],
  dietary_preferences: [],
  disliked_foods: [],
  meals_per_day: 4,
  routine: null,
};

describe('questionnaireSchema — bloqueio de menores de idade', () => {
  it('aceita um adulto de 18 anos', () => {
    expect(questionnaireSchema.safeParse({ ...BASE_INPUT, age: 18 }).success).toBe(true);
  });

  it('rejeita menores de 18 anos', () => {
    const result = questionnaireSchema.safeParse({ ...BASE_INPUT, age: 17 });
    expect(result.success).toBe(false);
  });

  it('rejeita idades claramente inválidas', () => {
    expect(questionnaireSchema.safeParse({ ...BASE_INPUT, age: 5 }).success).toBe(false);
    expect(questionnaireSchema.safeParse({ ...BASE_INPUT, age: 150 }).success).toBe(false);
  });
});

describe('questionnaireSchema — limites de conteúdo pro prompt de IA', () => {
  it('rejeita mais de 20 alergias', () => {
    const allergies = Array.from({ length: 21 }, (_, i) => `alergia-${i}`);
    expect(questionnaireSchema.safeParse({ ...BASE_INPUT, allergies }).success).toBe(false);
  });

  it('aceita até 20 alergias', () => {
    const allergies = Array.from({ length: 20 }, (_, i) => `alergia-${i}`);
    expect(questionnaireSchema.safeParse({ ...BASE_INPUT, allergies }).success).toBe(true);
  });

  it('rejeita item de alergia com mais de 60 caracteres', () => {
    const allergies = ['a'.repeat(61)];
    expect(questionnaireSchema.safeParse({ ...BASE_INPUT, allergies }).success).toBe(false);
  });

  it('rejeita rotina com mais de 500 caracteres', () => {
    expect(questionnaireSchema.safeParse({ ...BASE_INPUT, routine: 'a'.repeat(501) }).success).toBe(false);
  });

  it('peso e altura fora de faixas plausíveis são rejeitados', () => {
    expect(questionnaireSchema.safeParse({ ...BASE_INPUT, weight: 10 }).success).toBe(false);
    expect(questionnaireSchema.safeParse({ ...BASE_INPUT, height: 500 }).success).toBe(false);
  });
});

describe('questionnaireSchema — sexo biológico (entrada obrigatória do cálculo de energia)', () => {
  it('rejeita quando biological_sex está ausente', () => {
    const withoutSex: Record<string, unknown> = { ...BASE_INPUT };
    delete withoutSex.biological_sex;
    expect(questionnaireSchema.safeParse(withoutSex).success).toBe(false);
  });

  it('rejeita valores fora de male/female', () => {
    expect(questionnaireSchema.safeParse({ ...BASE_INPUT, biological_sex: 'other' }).success).toBe(false);
  });

  it('aceita male e female', () => {
    expect(questionnaireSchema.safeParse({ ...BASE_INPUT, biological_sex: 'male' }).success).toBe(true);
    expect(questionnaireSchema.safeParse({ ...BASE_INPUT, biological_sex: 'female' }).success).toBe(true);
  });
});

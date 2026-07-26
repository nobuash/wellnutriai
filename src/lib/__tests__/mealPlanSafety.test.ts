import { describe, expect, it } from 'vitest';
import { findForbiddenFoods, isHighRiskCondition } from '@/lib/mealPlanSafety';
import type { MealPlanContent } from '@/types/database';

describe('isHighRiskCondition', () => {
  it('não bloqueia quando nenhuma condição está presente', () => {
    expect(isHighRiskCondition({ diabetes_type: 'none' })).toBe(false);
  });

  it('bloqueia qualquer tipo de diabetes', () => {
    expect(isHighRiskCondition({ diabetes_type: 'type1' })).toBe(true);
    expect(isHighRiskCondition({ diabetes_type: 'type2' })).toBe(true);
    expect(isHighRiskCondition({ diabetes_type: 'pre_diabetes' })).toBe(true);
  });

  it('bloqueia gestação e amamentação', () => {
    expect(isHighRiskCondition({ diabetes_type: 'none', is_pregnant: true })).toBe(true);
    expect(isHighRiskCondition({ diabetes_type: 'none', is_breastfeeding: true })).toBe(true);
  });

  it('bloqueia doença renal, hepática, transtorno alimentar, alergia severa e uso de insulina', () => {
    expect(isHighRiskCondition({ has_kidney_disease: true })).toBe(true);
    expect(isHighRiskCondition({ has_liver_disease: true })).toBe(true);
    expect(isHighRiskCondition({ has_eating_disorder_history: true })).toBe(true);
    expect(isHighRiskCondition({ has_severe_allergy: true })).toBe(true);
    expect(isHighRiskCondition({ uses_insulin: true })).toBe(true);
  });

  it('bloqueia quando há texto livre em outra condição médica (não classificável automaticamente)', () => {
    expect(isHighRiskCondition({ other_medical_condition: 'hipotireoidismo' })).toBe(true);
    expect(isHighRiskCondition({ other_medical_condition: '   ' })).toBe(false);
    expect(isHighRiskCondition({ other_medical_condition: null })).toBe(false);
  });
});

function plan(meals: MealPlanContent['meals']): MealPlanContent {
  return {
    summary: 'resumo',
    total_calories: 2000,
    macros: { protein_g: 100, carbs_g: 200, fat_g: 60 },
    meals,
    observations: [],
    disclaimer: 'disclaimer',
  };
}

describe('findForbiddenFoods', () => {
  it('não encontra nada quando não há alergias', () => {
    const content = plan([{ name: 'Almoço', time: '12:00', foods: [{ item: 'Frango', quantity: '150g' }], calories: 300, macros: { protein_g: 30, carbs_g: 0, fat_g: 10 } }]);
    expect(findForbiddenFoods(content, [])).toEqual([]);
  });

  it('detecta o alimento proibido diretamente', () => {
    const content = plan([{ name: 'Café', time: '08:00', foods: [{ item: 'Leite integral', quantity: '200ml' }], calories: 150, macros: { protein_g: 8, carbs_g: 12, fat_g: 8 } }]);
    expect(findForbiddenFoods(content, ['leite'])).toContain('Leite integral');
  });

  it('detecta derivados comuns de um alérgeno (leite -> queijo/iogurte/whey)', () => {
    const content = plan([{ name: 'Lanche', time: '16:00', foods: [{ item: 'Queijo minas', quantity: '30g' }], calories: 100, macros: { protein_g: 7, carbs_g: 1, fat_g: 8 } }]);
    expect(findForbiddenFoods(content, ['leite'])).toContain('Queijo minas');
  });

  it('ignora acentuação e caixa ao comparar', () => {
    const content = plan([{ name: 'Jantar', time: '20:00', foods: [{ item: 'PÃO integral', quantity: '2 fatias' }], calories: 180, macros: { protein_g: 6, carbs_g: 30, fat_g: 2 } }]);
    expect(findForbiddenFoods(content, ['gluten'])).toContain('PÃO integral');
  });

  it('não gera falso positivo para alimentos não relacionados', () => {
    const content = plan([{ name: 'Almoço', time: '12:00', foods: [{ item: 'Arroz', quantity: '100g' }, { item: 'Frango grelhado', quantity: '150g' }], calories: 350, macros: { protein_g: 35, carbs_g: 30, fat_g: 5 } }]);
    expect(findForbiddenFoods(content, ['amendoim', 'camarao'])).toEqual([]);
  });
});

import { describe, expect, it } from 'vitest';
import { validateMealPlanMath } from '@/lib/nutrition/mealPlanMath';
import type { MealPlanContent } from '@/types/database';

function validPlan(overrides: Partial<MealPlanContent> = {}): MealPlanContent {
  return {
    summary: 'resumo',
    total_calories: 2000,
    macros: { protein_g: 150, carbs_g: 200, fat_g: 56 }, // 150*4+200*4+56*9 = 600+800+504 = 1904 (~5% de 2000)
    meals: [
      { name: 'Café', time: '08:00', foods: [{ item: 'Ovos', quantity: '2un' }], calories: 500, macros: { protein_g: 35, carbs_g: 50, fat_g: 14 } },
      { name: 'Almoço', time: '12:00', foods: [{ item: 'Frango', quantity: '150g' }], calories: 700, macros: { protein_g: 55, carbs_g: 70, fat_g: 20 } },
      { name: 'Jantar', time: '19:00', foods: [{ item: 'Peixe', quantity: '150g' }], calories: 800, macros: { protein_g: 60, carbs_g: 80, fat_g: 22 } },
    ],
    observations: [],
    disclaimer: 'disclaimer',
    ...overrides,
  };
}

describe('validateMealPlanMath', () => {
  it('não encontra problema em um plano internamente consistente', () => {
    expect(validateMealPlanMath(validPlan())).toEqual([]);
  });

  it('aceita quando a meta de calorias informada bate com total_calories', () => {
    expect(validateMealPlanMath(validPlan(), 2000)).toEqual([]);
  });

  it('rejeita quando total_calories diverge da meta calculada em mais de 10%', () => {
    const issues = validateMealPlanMath(validPlan({ total_calories: 2500 }), 2000);
    expect(issues.some((i) => i.code === 'calories_off_target')).toBe(true);
  });

  it('rejeita número negativo em total_calories', () => {
    const issues = validateMealPlanMath(validPlan({ total_calories: -100 }));
    expect(issues.some((i) => i.code === 'invalid_number')).toBe(true);
  });

  it('rejeita NaN em qualquer campo de macro', () => {
    const issues = validateMealPlanMath(validPlan({ macros: { protein_g: NaN, carbs_g: 200, fat_g: 56 } }));
    expect(issues.some((i) => i.code === 'invalid_number')).toBe(true);
  });

  it('rejeita campo ausente (undefined) em uma refeição', () => {
    const plan = validPlan();
    // simula resposta malformada da IA (campo obrigatório ausente)
    const meals = [...plan.meals];
    meals[0] = { ...meals[0], calories: undefined as unknown as number };
    const issues = validateMealPlanMath({ ...plan, meals });
    expect(issues.some((i) => i.code === 'invalid_number' && i.message.includes('meals[0].calories'))).toBe(true);
  });

  it('rejeita calorias diárias implausivelmente altas', () => {
    const issues = validateMealPlanMath(validPlan({ total_calories: 50000, macros: { protein_g: 3000, carbs_g: 4000, fat_g: 1500 } }));
    expect(issues.some((i) => i.code === 'calories_too_high')).toBe(true);
  });

  it('rejeita quando a soma dos macros (regra 4/4/9) diverge muito de total_calories', () => {
    // macros somam bem menos que o total declarado
    const issues = validateMealPlanMath(validPlan({ macros: { protein_g: 10, carbs_g: 10, fat_g: 5 } }));
    expect(issues.some((i) => i.code === 'macros_calories_mismatch')).toBe(true);
  });

  it('rejeita quando a soma das refeições diverge muito de total_calories', () => {
    const plan = validPlan({ total_calories: 5000 }); // meals somam 2000, não 5000
    const issues = validateMealPlanMath(plan);
    expect(issues.some((i) => i.code === 'meals_total_mismatch')).toBe(true);
  });

  it('rejeita plano sem nenhuma refeição', () => {
    const issues = validateMealPlanMath(validPlan({ meals: [] }));
    expect(issues.some((i) => i.code === 'no_meals')).toBe(true);
  });

  it('tolera pequena variação de arredondamento entre macros e total', () => {
    // 1904 kcal via macros vs 2000 declarado = 4.8% de diferença, dentro da tolerância de 15%
    expect(validateMealPlanMath(validPlan())).toEqual([]);
  });
});

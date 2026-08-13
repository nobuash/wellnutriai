import type { MealPlanContent } from '@/types/database';

// Validação determinística além do Zod (que só garante tipo/formato).
// Zod já rejeita números negativos/zero via .positive(), mas essas
// checagens continuam explícitas aqui de propósito — são a barreira
// específica contra a IA devolver um JSON estruturalmente válido e
// ainda assim matematicamente absurdo ou inconsistente.

// Não é limite clínico — é um teto de sanidade contra erro grosseiro
// (ex: a IA confundir kcal com kJ, ou multiplicar por 10 sem querer).
const MAX_PLAUSIBLE_DAILY_CALORIES = 10000;

// Tolerância larga de propósito: a IA arredonda cada refeição/macro
// individualmente, então a soma nunca bate exatamente. O objetivo é
// pegar divergência grosseira, não arredondamento normal.
const INTERNAL_CONSISTENCY_TOLERANCE = 0.15;
const EXPECTED_CALORIES_TOLERANCE = 0.10;

export interface MealPlanMathIssue {
  code: string;
  message: string;
}

function isFiniteNonNegative(n: unknown): n is number {
  return typeof n === 'number' && Number.isFinite(n) && n >= 0;
}

function relativeDeviation(value: number, target: number): number {
  if (target <= 0) return Infinity;
  return Math.abs(value - target) / target;
}

/**
 * expectedCalories é opcional: quando informado (ver
 * src/lib/nutrition/energy.ts), também confere se a IA respeitou a
 * meta de calorias que o prompt pediu explicitamente para usar.
 */
export function validateMealPlanMath(content: MealPlanContent, expectedCalories?: number): MealPlanMathIssue[] {
  const issues: MealPlanMathIssue[] = [];

  const topLevelFields: Array<[string, unknown]> = [
    ['total_calories', content.total_calories],
    ['macros.protein_g', content.macros?.protein_g],
    ['macros.carbs_g', content.macros?.carbs_g],
    ['macros.fat_g', content.macros?.fat_g],
  ];
  for (const [name, value] of topLevelFields) {
    if (!isFiniteNonNegative(value)) {
      issues.push({ code: 'invalid_number', message: `${name} ausente ou inválido: ${String(value)}` });
    }
  }
  const meals = content.meals ?? [];
  if (meals.length === 0) {
    issues.push({ code: 'no_meals', message: 'Plano sem nenhuma refeição' });
  }
  meals.forEach((meal, i) => {
    const fields: Array<[string, unknown]> = [
      [`meals[${i}].calories`, meal.calories],
      [`meals[${i}].macros.protein_g`, meal.macros?.protein_g],
      [`meals[${i}].macros.carbs_g`, meal.macros?.carbs_g],
      [`meals[${i}].macros.fat_g`, meal.macros?.fat_g],
    ];
    for (const [name, value] of fields) {
      if (!isFiniteNonNegative(value)) {
        issues.push({ code: 'invalid_number', message: `${name} ausente ou inválido: ${String(value)}` });
      }
    }
  });

  // Sem números válidos, nenhuma checagem de consistência abaixo faz
  // sentido (evita NaN se propagando silenciosamente pelas contas).
  if (issues.length > 0) return issues;

  if (content.total_calories > MAX_PLAUSIBLE_DAILY_CALORIES) {
    issues.push({ code: 'calories_too_high', message: `total_calories implausível: ${content.total_calories}` });
  }

  if (typeof expectedCalories === 'number') {
    const deviation = relativeDeviation(content.total_calories, expectedCalories);
    if (deviation > EXPECTED_CALORIES_TOLERANCE) {
      issues.push({
        code: 'calories_off_target',
        message: `total_calories (${content.total_calories}) diverge da meta calculada (${expectedCalories}) em mais de ${EXPECTED_CALORIES_TOLERANCE * 100}%`,
      });
    }
  }

  const macroCalories = content.macros.protein_g * 4 + content.macros.carbs_g * 4 + content.macros.fat_g * 9;
  if (relativeDeviation(macroCalories, content.total_calories) > INTERNAL_CONSISTENCY_TOLERANCE) {
    issues.push({
      code: 'macros_calories_mismatch',
      message: `Soma dos macros (${macroCalories.toFixed(0)} kcal, regra 4/4/9) diverge de total_calories (${content.total_calories}) em mais de ${INTERNAL_CONSISTENCY_TOLERANCE * 100}%`,
    });
  }

  const mealsCaloriesSum = meals.reduce((sum, m) => sum + m.calories, 0);
  if (relativeDeviation(mealsCaloriesSum, content.total_calories) > INTERNAL_CONSISTENCY_TOLERANCE) {
    issues.push({
      code: 'meals_total_mismatch',
      message: `Soma das calorias das refeições (${mealsCaloriesSum.toFixed(0)}) diverge de total_calories (${content.total_calories}) em mais de ${INTERNAL_CONSISTENCY_TOLERANCE * 100}%`,
    });
  }

  return issues;
}

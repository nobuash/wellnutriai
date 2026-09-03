import { TACO_FOODS } from '@/lib/taco/data';
import type { TacoFood } from '@/lib/taco/types';

const TACO_BY_ID = new Map<string, TacoFood>(TACO_FOODS.map((f) => [f.id, f]));

export interface CalculatedItem {
  tacoId: string;
  name: string;
  gramas: number;
  kcal: number;
  proteina_g: number;
  carbo_g: number;
  gordura_g: number;
  fibra_g: number;
}

export interface NutritionTotals {
  kcal: number;
  proteina_g: number;
  carbo_g: number;
  gordura_g: number;
  fibra_g: number;
}

export interface NutritionCalculation {
  items: CalculatedItem[];
  totals: NutritionTotals;
}

function round1(n: number): number {
  return Math.round(n * 10) / 10;
}

/**
 * Regra de três simples a partir dos valores por 100g da TACO — a
 * ÚNICA aritmética nutricional do produto. Nunca chame isto com um
 * tacoId que não veio de src/lib/taco/normalize.ts::normalizeFood()
 * retornando 'matched' — um id desconhecido é um bug de quem chama,
 * não um caso a tratar silenciosamente aqui (por isso lança, em vez
 * de devolver null/zero).
 */
export function calculateNutrition(items: Array<{ tacoId: string; gramas: number }>): NutritionCalculation {
  const calculated: CalculatedItem[] = items.map(({ tacoId, gramas }) => {
    const food = TACO_BY_ID.get(tacoId);
    if (!food) {
      throw new Error(`calculateNutrition: tacoId desconhecido "${tacoId}" — não existe na base TACO local.`);
    }
    if (!Number.isFinite(gramas) || gramas <= 0) {
      throw new Error(`calculateNutrition: gramas inválido para "${tacoId}": ${gramas}`);
    }

    const factor = gramas / 100;
    return {
      tacoId,
      name: food.name,
      gramas,
      kcal: Math.round(food.kcal100g * factor),
      proteina_g: round1(food.protein100g * factor),
      carbo_g: round1(food.carbs100g * factor),
      gordura_g: round1(food.fat100g * factor),
      fibra_g: round1(food.fiber100g * factor),
    };
  });

  const totals = calculated.reduce<NutritionTotals>(
    (acc, item) => ({
      kcal: acc.kcal + item.kcal,
      proteina_g: round1(acc.proteina_g + item.proteina_g),
      carbo_g: round1(acc.carbo_g + item.carbo_g),
      gordura_g: round1(acc.gordura_g + item.gordura_g),
      fibra_g: round1(acc.fibra_g + item.fibra_g),
    }),
    { kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0, fibra_g: 0 },
  );

  return { items: calculated, totals };
}

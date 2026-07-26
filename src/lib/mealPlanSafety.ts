import type { MealPlanContent, NutritionQuestionnaire } from '@/types/database';
import { z } from 'zod';

export const MEDICAL_RESTRICTION_MESSAGE =
  'Identificamos uma condição de saúde no seu questionário (diabetes) que exige acompanhamento ' +
  'profissional individualizado — o ajuste de carboidratos e o risco de hipo/hiperglicemia não podem ' +
  'ser calculados com segurança por um plano automatizado. Por isso não geramos um plano alimentar ' +
  'personalizado para essa condição. Recomendamos fortemente uma avaliação com um(a) nutricionista ou ' +
  'endocrinologista antes de qualquer mudança na alimentação.';

/**
 * Condições em que a geração automatizada de plano personalizado é
 * bloqueada no MVP. Hoje o questionário só coleta diabetes_type — não
 * existem campos para gestação, amamentação, doença renal ou
 * transtorno alimentar, então esta função não pode (ainda) considerar
 * essas condições. Ver docs/production-hardening-audit.md.
 */
export function isHighRiskCondition(q: Pick<NutritionQuestionnaire, 'diabetes_type'>): boolean {
  return q.diabetes_type !== 'none';
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, ''); // remove acentos
}

/**
 * Verificação determinística de alergias — não confia apenas no
 * prompt. Procura o termo da alergia (e um punhado de derivados
 * comuns) como substring nos alimentos do plano gerado.
 */
const COMMON_DERIVATIVES: Record<string, string[]> = {
  leite: ['leite', 'laticinio', 'queijo', 'iogurte', 'manteiga', 'requeijao', 'whey'],
  lactose: ['leite', 'laticinio', 'queijo', 'iogurte', 'lactose'],
  amendoim: ['amendoim', 'pasta de amendoim'],
  gluten: ['gluten', 'trigo', 'farinha de trigo', 'cevada', 'centeio', 'pao', 'macarrao', 'aveia'],
  ovo: ['ovo', 'clara de ovo', 'gema'],
  soja: ['soja', 'tofu', 'shoyu', 'molho de soja'],
  frutos_do_mar: ['camarao', 'lagosta', 'caranguejo', 'marisco', 'fruto do mar'],
  peixe: ['peixe', 'salmao', 'atum', 'tilapia', 'sardinha'],
  castanha: ['castanha', 'noz', 'amendoa', 'avela', 'macadamia'],
};

function expandAllergyTerms(allergy: string): string[] {
  const norm = normalize(allergy.trim());
  if (!norm) return [];
  const key = norm.replace(/\s+/g, '_');
  return [norm, ...(COMMON_DERIVATIVES[key] ?? [])];
}

/**
 * Retorna o(s) termo(s) proibido(s) encontrado(s) nos alimentos do
 * plano, ou null se estiver tudo seguro. Verificação puramente
 * textual — não substitui julgamento clínico, mas pega o caso comum
 * de a IA ignorar a instrução do prompt.
 */
export function findForbiddenFoods(content: MealPlanContent, allergies: string[]): string[] {
  if (!allergies.length) return [];
  const terms = allergies.flatMap(expandAllergyTerms);
  if (!terms.length) return [];

  const foodStrings = (content.meals ?? []).flatMap((m) => m.foods?.map((f) => f.item) ?? []);
  const hits = new Set<string>();

  for (const food of foodStrings) {
    const normFood = normalize(food);
    for (const term of terms) {
      if (term.length >= 3 && normFood.includes(term)) {
        hits.add(food);
      }
    }
  }

  return Array.from(hits);
}

// Validação estrutural da resposta da IA — nunca confie em JSON.parse(raw) as T.
export const mealPlanContentSchema = z.object({
  summary: z.string().min(1),
  total_calories: z.number().positive(),
  daily_water_ml: z.number().positive().optional(),
  macros: z.object({
    protein_g: z.number().nonnegative(),
    carbs_g: z.number().nonnegative(),
    fat_g: z.number().nonnegative(),
  }),
  meals: z.array(z.object({
    name: z.string().min(1),
    time: z.string().min(1),
    foods: z.array(z.object({
      item: z.string().min(1),
      quantity: z.string().min(1),
    })).min(1),
    calories: z.number().positive(),
    macros: z.object({
      protein_g: z.number().nonnegative(),
      carbs_g: z.number().nonnegative(),
      fat_g: z.number().nonnegative(),
    }),
  })).min(1),
  observations: z.array(z.string()).default([]),
  disclaimer: z.string().default(''),
});

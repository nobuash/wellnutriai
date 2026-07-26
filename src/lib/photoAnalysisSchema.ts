import { z } from 'zod';

// Validação estrutural da resposta da IA para análise de refeição
// (por foto ou manual) — nunca confie em JSON.parse(raw) as T.
export const photoAnalysisResultSchema = z.object({
  foods: z.array(z.object({
    name: z.string().min(1),
    grams: z.number().positive().optional(),
    estimated_calories: z.number().nonnegative(),
    macros: z.object({
      protein_g: z.number().nonnegative(),
      carbs_g: z.number().nonnegative(),
      fat_g: z.number().nonnegative(),
    }).optional(),
  })).default([]),
  total_calories_estimate: z.number().nonnegative(),
  notes: z.string().default(''),
  disclaimer: z.string().default(''),
});

import { z } from 'zod';

export const signupSchema = z.object({
  name: z.string().min(2, 'Nome muito curto'),
  email: z.string().email('E-mail inválido'),
  confirmEmail: z.string().email('E-mail inválido'),
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  confirmPassword: z.string().min(1, 'Obrigatório'),
}).refine((d) => d.email === d.confirmEmail, {
  message: 'Os e-mails não coincidem',
  path: ['confirmEmail'],
}).refine((d) => d.password === d.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

export const loginSchema = z.object({
  email: z.string().email('E-mail inválido'),
  password: z.string().min(1, 'Obrigatório'),
});

export const questionnaireSchema = z.object({
  age: z.coerce.number().int().min(12).max(100),
  weight: z.coerce.number().min(30).max(300),
  height: z.coerce.number().min(100).max(250),
  body_fat: z.coerce.number().min(3).max(60).optional().nullable(),
  goal: z.enum(['gain_muscle', 'lose_fat', 'maintain']),
  activity_level: z.enum(['sedentary', 'light', 'moderate', 'intense', 'athlete']),
  allergies: z.array(z.string()).default([]),
  dietary_preferences: z.array(z.string()).default([]),
  disliked_foods: z.array(z.string()).default([]),
  meals_per_day: z.coerce.number().int().min(2).max(8),
  routine: z.string().max(500).optional().nullable(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type QuestionnaireInput = z.infer<typeof questionnaireSchema>;

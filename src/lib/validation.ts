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

export const forgotPasswordSchema = z.object({
  email: z.string().email('E-mail inválido'),
});

export const resetPasswordSchema = z.object({
  password: z.string().min(8, 'Mínimo 8 caracteres'),
  confirmPassword: z.string().min(1, 'Obrigatório'),
}).refine((d) => d.password === d.confirmPassword, {
  message: 'As senhas não coincidem',
  path: ['confirmPassword'],
});

export const questionnaireSchema = z.object({
  age: z.coerce.number().int().min(18, 'É preciso ter 18 anos ou mais').max(100),
  weight: z.coerce.number().min(30).max(300),
  height: z.coerce.number().min(100).max(250),
  body_fat: z.preprocess(
    (v) => (v === '' || v === null || v === undefined ? null : Number(v)),
    z.number().min(3).max(60).nullable().optional()
  ),
  goal: z.enum(['gain_muscle', 'lose_fat', 'maintain']),
  activity_level: z.enum(['sedentary', 'light', 'moderate', 'intense', 'athlete']),
  diabetes_type: z.enum(['none', 'type1', 'type2', 'pre_diabetes']),
  allergies: z.array(z.string().max(60)).max(20).default([]),
  dietary_preferences: z.array(z.string().max(60)).max(20).default([]),
  disliked_foods: z.array(z.string().max(60)).max(30).default([]),
  meals_per_day: z.coerce.number().int().min(2).max(8),
  routine: z.string().max(500).optional().nullable(),
  is_pregnant: z.boolean().default(false),
  is_breastfeeding: z.boolean().default(false),
  has_kidney_disease: z.boolean().default(false),
  has_liver_disease: z.boolean().default(false),
  has_eating_disorder_history: z.boolean().default(false),
  has_severe_allergy: z.boolean().default(false),
  uses_insulin: z.boolean().default(false),
  other_medical_condition: z.string().max(300).optional().nullable(),
});

export type SignupInput = z.infer<typeof signupSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
export type QuestionnaireInput = z.infer<typeof questionnaireSchema>;

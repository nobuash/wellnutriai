export type Plan = 'free' | 'pro';
export type Goal = 'gain_muscle' | 'lose_fat' | 'maintain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'intense' | 'athlete';
export type DiabetesType = 'none' | 'type1' | 'type2' | 'pre_diabetes';

export interface Profile {
  id: string;
  email: string;
  name: string | null;
  plan: Plan;
  accepted_terms: boolean;
  accepted_terms_at: string | null;
  created_at: string;
}

export interface NutritionQuestionnaire {
  id: string;
  user_id: string;
  age: number;
  weight: number;
  height: number;
  body_fat: number | null;
  goal: Goal;
  activity_level: ActivityLevel;
  diabetes_type: DiabetesType;
  allergies: string[];
  dietary_preferences: string[];
  disliked_foods: string[];
  meals_per_day: number;
  routine: string | null;
  is_pregnant: boolean;
  is_breastfeeding: boolean;
  has_kidney_disease: boolean;
  has_liver_disease: boolean;
  has_eating_disorder_history: boolean;
  has_severe_allergy: boolean;
  uses_insulin: boolean;
  other_medical_condition: string | null;
  created_at: string;
}

export interface Meal {
  name: string;
  time: string;
  foods: Array<{ item: string; quantity: string }>;
  calories: number;
  macros: { protein_g: number; carbs_g: number; fat_g: number };
}

export interface MealPlanContent {
  summary: string;
  total_calories: number;
  daily_water_ml?: number;
  macros: { protein_g: number; carbs_g: number; fat_g: number };
  meals: Meal[];
  observations: string[];
  disclaimer: string;
}

export interface MealPlan {
  id: string;
  user_id: string;
  questionnaire_id: string | null;
  content: MealPlanContent;
  calories_estimate: number | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  user_id: string;
  role: 'user' | 'ai';
  message: string;
  created_at: string;
}

// Item já calculado a partir da TACO (ver src/lib/nutrition/calculate.ts)
// — nome oficial, porção e valores nutricionais determinísticos, nunca
// estimados pelo LLM.
export interface NutritionAnalysisItem {
  nome: string;
  gramas: number;
  estimado: boolean;
  kcal: number;
  proteina_g: number;
  carbo_g: number;
  gordura_g: number;
  fibra_g: number;
}

export interface NutritionAnalysisTotals {
  kcal: number;
  proteina_g: number;
  carbo_g: number;
  gordura_g: number;
  fibra_g: number;
}

// Alimento que o LLM identificou mas não teve match confiável na TACO
// — nunca tem valor nutricional inventado, só candidatos pra
// desambiguação (ou nenhum, se não achou nada parecido).
export interface NaoIdentificado {
  alimento: string;
  gramas: number;
  estimado: boolean;
  candidatos: Array<{ id: string; nome: string }>;
}

export interface NutritionAnalysisResult {
  itens: NutritionAnalysisItem[];
  totais: NutritionAnalysisTotals;
  fonte: string;
  nao_identificados: NaoIdentificado[];
  comentario?: string;
}

export interface MealPhotoAnalysis {
  id: string;
  user_id: string;
  image_url: string;
  result: NutritionAnalysisResult;
  created_at: string;
}

export interface KnowledgeChunk {
  id: string;
  source_name: string;
  source_type: 'ebook' | 'article' | 'guideline' | 'other';
  content: string;
  metadata: Record<string, unknown>;
  similarity?: number;
  created_at: string;
}

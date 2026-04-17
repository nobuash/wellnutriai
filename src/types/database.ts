export type Plan = 'free' | 'pro';
export type Goal = 'gain_muscle' | 'lose_fat' | 'maintain';
export type ActivityLevel = 'sedentary' | 'light' | 'moderate' | 'intense' | 'athlete';

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
  allergies: string[];
  dietary_preferences: string[];
  disliked_foods: string[];
  meals_per_day: number;
  routine: string | null;
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

export interface PhotoAnalysisResult {
  foods: Array<{ name: string; estimated_calories: number }>;
  total_calories_estimate: number;
  notes: string;
  disclaimer: string;
}

export interface MealPhotoAnalysis {
  id: string;
  user_id: string;
  image_url: string;
  result: PhotoAnalysisResult;
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

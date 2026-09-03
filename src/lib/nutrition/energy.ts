import type { ActivityLevel, BiologicalSex, Goal } from '@/types/database';

// Cálculo metabólico determinístico — a IA não decide mais BMR/TDEE
// (ver src/lib/openai/prompts.ts::buildMealPlanPrompt, que agora
// recebe os valores já calculados aqui como entrada fixa, não como
// algo para "calcular"). Fórmula de Mifflin-St Jeor, a mesma já usada
// pelo prompt antes desta mudança — só deixou de ser delegada ao LLM.
//
// Fatores e ajustes não são limites clínicos: são os mesmos valores
// que já estavam documentados no prompt anterior (déficit ~15-20%,
// superávit ~10%, água 35ml/kg). Qualquer revisão desses números por
// profissional habilitado deve mudar as constantes abaixo, não o
// prompt (que agora só consome o resultado).

const ACTIVITY_FACTOR: Record<ActivityLevel, number> = {
  sedentary: 1.2,
  light: 1.375,
  moderate: 1.55,
  intense: 1.725,
  athlete: 1.9,
};

const LOSE_FAT_DEFICIT = 0.175; // meio do intervalo ~15-20%
const GAIN_MUSCLE_SURPLUS = 0.10;

const WATER_ML_PER_KG = 35;
const WATER_ML_HIGH_ACTIVITY_BONUS = 500;

export interface EnergyInput {
  weightKg: number;
  heightCm: number;
  age: number;
  biologicalSex: BiologicalSex | null;
  activityLevel: ActivityLevel;
  goal: Goal;
}

export interface EnergyResult {
  bmr: number;
  tdee: number;
  targetCalories: number;
  dailyWaterMl: number;
}

function isValidPositiveNumber(n: number): boolean {
  return Number.isFinite(n) && n > 0;
}

/**
 * Retorna null (nunca um número fabricado) quando falta o dado
 * estritamente necessário para a fórmula — hoje isso só acontece com
 * questionários respondidos antes do campo biological_sex existir
 * (ver migration 027_biological_sex.sql). O chamador decide o que
 * fazer nesse caso (ex: pedir para a pessoa atualizar o questionário);
 * este módulo nunca adivinha.
 */
export function calculateEnergyTargets(input: EnergyInput): EnergyResult | null {
  const { weightKg, heightCm, age, biologicalSex, activityLevel, goal } = input;

  if (!biologicalSex) return null;
  if (!isValidPositiveNumber(weightKg) || !isValidPositiveNumber(heightCm) || !isValidPositiveNumber(age)) {
    return null;
  }

  const sexTerm = biologicalSex === 'male' ? 5 : -161;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + sexTerm;
  const tdee = bmr * ACTIVITY_FACTOR[activityLevel];

  const goalMultiplier =
    goal === 'lose_fat' ? 1 - LOSE_FAT_DEFICIT :
    goal === 'gain_muscle' ? 1 + GAIN_MUSCLE_SURPLUS :
    1;
  const targetCalories = tdee * goalMultiplier;

  const highActivityBonus =
    activityLevel === 'intense' || activityLevel === 'athlete' ? WATER_ML_HIGH_ACTIVITY_BONUS : 0;
  const dailyWaterMl = weightKg * WATER_ML_PER_KG + highActivityBonus;

  return {
    bmr: Math.round(bmr),
    tdee: Math.round(tdee),
    targetCalories: Math.round(targetCalories),
    dailyWaterMl: Math.round(dailyWaterMl / 10) * 10,
  };
}

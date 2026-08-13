import { describe, expect, it } from 'vitest';
import { calculateEnergyTargets, type EnergyInput } from '@/lib/nutrition/energy';

function baseInput(overrides: Partial<EnergyInput> = {}): EnergyInput {
  return {
    weightKg: 80,
    heightCm: 180,
    age: 30,
    biologicalSex: 'male',
    activityLevel: 'moderate',
    goal: 'maintain',
    ...overrides,
  };
}

describe('calculateEnergyTargets — Mifflin-St Jeor', () => {
  it('calcula BMR/TDEE/meta de calorias para homem, atividade moderada, manutenção', () => {
    const result = calculateEnergyTargets(baseInput());
    // BMR = 10*80 + 6.25*180 - 5*30 + 5 = 1780
    expect(result?.bmr).toBe(1780);
    // TDEE = 1780 * 1.55 = 2759
    expect(result?.tdee).toBe(2759);
    // maintain: sem ajuste
    expect(result?.targetCalories).toBe(2759);
    // água = 80*35 = 2800, sem bônus (moderado)
    expect(result?.dailyWaterMl).toBe(2800);
  });

  it('calcula para mulher, sedentária, perda de gordura', () => {
    const result = calculateEnergyTargets(
      baseInput({ weightKg: 60, heightCm: 165, age: 25, biologicalSex: 'female', activityLevel: 'sedentary', goal: 'lose_fat' }),
    );
    // BMR = 600 + 1031.25 - 125 - 161 = 1345.25 -> 1345
    expect(result?.bmr).toBe(1345);
    // TDEE = 1345.25 * 1.2 = 1614.3 -> 1614
    expect(result?.tdee).toBe(1614);
    // déficit de 17.5%: 1614.3 * 0.825 = 1331.7975 -> 1332
    expect(result?.targetCalories).toBe(1332);
    // água = 60*35 = 2100, sem bônus
    expect(result?.dailyWaterMl).toBe(2100);
  });

  it('calcula para homem, atleta, ganho de massa (com bônus de água)', () => {
    const result = calculateEnergyTargets(
      baseInput({ weightKg: 90, heightCm: 175, age: 40, activityLevel: 'athlete', goal: 'gain_muscle' }),
    );
    // BMR = 900 + 1093.75 - 200 + 5 = 1798.75 -> 1799
    expect(result?.bmr).toBe(1799);
    // TDEE = 1798.75 * 1.9 = 3417.625 -> 3418
    expect(result?.tdee).toBe(3418);
    // superávit de 10%: 3417.625 * 1.10 = 3759.3875 -> 3759
    expect(result?.targetCalories).toBe(3759);
    // água = 90*35 + 500 (atividade intensa) = 3650
    expect(result?.dailyWaterMl).toBe(3650);
  });

  it('aplica o bônus de água também para atividade intensa (não só atleta)', () => {
    const withBonus = calculateEnergyTargets(baseInput({ activityLevel: 'intense' }));
    const withoutBonus = calculateEnergyTargets(baseInput({ activityLevel: 'moderate' }));
    expect(withBonus!.dailyWaterMl - withoutBonus!.dailyWaterMl).toBe(500);
  });

  it('sexo biológico muda o BMR em exatamente 166 (termo +5 vs -161)', () => {
    const male = calculateEnergyTargets(baseInput({ biologicalSex: 'male' }));
    const female = calculateEnergyTargets(baseInput({ biologicalSex: 'female' }));
    expect(male!.bmr - female!.bmr).toBe(166);
  });

  it('cada nível de atividade produz um TDEE estritamente maior que o anterior', () => {
    const levels = ['sedentary', 'light', 'moderate', 'intense', 'athlete'] as const;
    const tdees = levels.map((activityLevel) => calculateEnergyTargets(baseInput({ activityLevel }))!.tdee);
    for (let i = 1; i < tdees.length; i++) {
      expect(tdees[i]).toBeGreaterThan(tdees[i - 1]);
    }
  });

  it('lose_fat gera meta menor que maintain, e gain_muscle gera meta maior', () => {
    const lose = calculateEnergyTargets(baseInput({ goal: 'lose_fat' }))!.targetCalories;
    const maintain = calculateEnergyTargets(baseInput({ goal: 'maintain' }))!.targetCalories;
    const gain = calculateEnergyTargets(baseInput({ goal: 'gain_muscle' }))!.targetCalories;
    expect(lose).toBeLessThan(maintain);
    expect(gain).toBeGreaterThan(maintain);
  });

  it('retorna null quando biological_sex está ausente — nunca fabrica um resultado', () => {
    expect(calculateEnergyTargets(baseInput({ biologicalSex: null }))).toBeNull();
  });

  it('retorna null para peso, altura ou idade inválidos (zero, negativo ou NaN)', () => {
    expect(calculateEnergyTargets(baseInput({ weightKg: 0 }))).toBeNull();
    expect(calculateEnergyTargets(baseInput({ weightKg: -10 }))).toBeNull();
    expect(calculateEnergyTargets(baseInput({ heightCm: NaN }))).toBeNull();
    expect(calculateEnergyTargets(baseInput({ age: 0 }))).toBeNull();
  });
});

import type { Plan } from '@/types/database';

export interface PlanLimits {
  mealPlansPerMonth: number; // -1 = ilimitado
  photoAnalysis: boolean;
  chatMessagesPerDay: number; // -1 = ilimitado
}

export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    mealPlansPerMonth: 1,
    photoAnalysis: false,
    chatMessagesPerDay: 0, // sem acesso ao chat no plano free
  },
  pro: {
    mealPlansPerMonth: -1,
    photoAnalysis: true,
    chatMessagesPerDay: -1,
  },
};

export function canUseFeature(
  plan: Plan,
  feature: keyof PlanLimits,
  currentUsage = 0
): { allowed: boolean; reason?: string } {
  const limits = PLAN_LIMITS[plan];
  const limit = limits[feature];

  if (typeof limit === 'boolean') {
    return limit
      ? { allowed: true }
      : { allowed: false, reason: 'Recurso disponível apenas no plano PRO' };
  }

  if (limit === -1) return { allowed: true };
  if (currentUsage >= limit) {
    return { allowed: false, reason: `Limite do plano ${plan.toUpperCase()} atingido` };
  }
  return { allowed: true };
}

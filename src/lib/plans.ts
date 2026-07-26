import type { Plan } from '@/types/database';

export interface PlanLimits {
  mealPlansPerMonth: number; // -1 = ilimitado, 0 = bloqueado
  photoAnalysisPerMonth: number;
  chatMessagesPerMonth: number;
}

// Nenhum plano PRO é tecnicamente ilimitado — os limites abaixo existem
// para proteger a margem (custo de IA por usuário). A comunicação ao
// usuário deve dizer "uso amplo sujeito à política de uso justo", nunca
// "ilimitado", para não contradizer isto.
export const PLAN_LIMITS: Record<Plan, PlanLimits> = {
  free: {
    mealPlansPerMonth: 1,
    photoAnalysisPerMonth: 0,
    chatMessagesPerMonth: 0,
  },
  pro: {
    mealPlansPerMonth: 6,
    photoAnalysisPerMonth: 30,
    chatMessagesPerMonth: 300,
  },
};

export function featureLimitReason(plan: Plan, feature: keyof PlanLimits): string {
  const limit = PLAN_LIMITS[plan][feature];
  if (limit === 0) return 'Recurso disponível apenas no plano PRO';
  return `Limite mensal do plano ${plan.toUpperCase()} atingido. Tente novamente no próximo mês ou fale com o suporte.`;
}

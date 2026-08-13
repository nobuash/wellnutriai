declare global {
  interface Window {
    gtag?: (...args: unknown[]) => void;
    dataLayer?: unknown[];
  }
}

// Vocabulário padronizado do funil do produto. Nenhuma chamada deve
// receber nome, e-mail, peso, medidas, conteúdo de plano alimentar,
// mensagens de chat, fotos ou qualquer outro dado pessoal/sensível
// como parâmetro — só contadores/flags sem valor identificável.
export type AnalyticsEvent =
  | 'click_create_account'
  | 'signup_started'
  | 'signup_completed'
  | 'questionnaire_started'
  | 'questionnaire_completed'
  | 'meal_plan_generated'
  | 'photo_analysis_used'
  | 'pricing_viewed'
  | 'pro_clicked'
  | 'checkout_started'
  | 'subscription_completed';

export function trackEvent(name: AnalyticsEvent, params?: Record<string, string | number | boolean>): void {
  if (typeof window === 'undefined' || typeof window.gtag !== 'function') return;
  window.gtag('event', name, params);
}

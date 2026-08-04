import Stripe from 'stripe';
import type { PlanInterval } from '@/lib/mercadopago/client';

let stripe: Stripe | null = null;

export function getStripe() {
  if (!stripe) {
    // Verificado no runtime do SDK instalado (stripe@22.0.2,
    // node_modules/stripe/cjs/stripe.core.js): `version: props.apiVersion
    // || DEFAULT_API_VERSION` — o SDK JÁ usa sua própria versão
    // compilada por padrão quando apiVersion não é informado, nunca o
    // default da conta configurado no Dashboard. Não era uma falha de
    // segurança ativa. Fixamos explicitamente mesmo assim por
    // auditabilidade (fica visível no código, não só em node_modules) e
    // pra não herdar silenciosamente uma versão diferente numa futura
    // atualização do SDK sem decisão deliberada.
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: Stripe.API_VERSION });
  }
  return stripe;
}

export const STRIPE_INTERVALS: Record<PlanInterval, { interval: 'month' | 'year'; interval_count: number; amountCents: number; label: string }> = {
  monthly:   { interval: 'month', interval_count: 1,  amountCents: 2990,  label: 'WellNutriAI PRO — Mensal' },
  quarterly: { interval: 'month', interval_count: 3,  amountCents: 7445,  label: 'WellNutriAI PRO — Trimestral' },
  annual:    { interval: 'year',  interval_count: 1,  amountCents: 20452, label: 'WellNutriAI PRO — Anual' },
};

// Price IDs pré-configurados no Stripe Dashboard — nunca busca/cria
// Product/Price dinamicamente em cada checkout (round 3). Buscar ou
// criar a cada requisição tinha latência extra, risco de corrida (duas
// requisições concorrentes podiam criar dois Price objects
// equivalentes) e nenhum controle comercial explícito sobre o que
// existe na Stripe. Precisa ser configurado no Stripe Dashboard antes
// do deploy — ver .env.example.
const STRIPE_PRICE_ENV: Record<PlanInterval, string | undefined> = {
  monthly: process.env.STRIPE_PRICE_MONTHLY,
  quarterly: process.env.STRIPE_PRICE_QUARTERLY,
  annual: process.env.STRIPE_PRICE_ANNUAL,
};

export function getStripePriceId(planInterval: PlanInterval): string {
  const priceId = STRIPE_PRICE_ENV[planInterval];
  if (!priceId) {
    throw new Error(
      `STRIPE_PRICE_${planInterval.toUpperCase()} não configurado — crie o Price correspondente no Stripe Dashboard e defina a variável de ambiente.`,
    );
  }
  return priceId;
}

/**
 * Allowlist de Price IDs válidos — os únicos 3 que
 * src/app/api/payment/stripe/intent/route.ts usa pra criar checkout.
 * Usado por activateStripeSubscription() pra recusar conceder PRO a
 * uma assinatura Stripe com um price fora desses 3, mesmo que
 * sub.metadata.userId bata com o usuário certo (ver round 4 —
 * CONFIRMADO que a ativação nunca checava o price da assinatura
 * retornada pela Stripe antes de conceder acesso).
 */
export function isAllowedStripePriceId(priceId: string | null | undefined): boolean {
  if (!priceId) return false;
  return Object.values(STRIPE_PRICE_ENV).includes(priceId);
}

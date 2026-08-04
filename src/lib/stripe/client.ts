import Stripe from 'stripe';
import type { PlanInterval } from '@/lib/mercadopago/client';

let stripe: Stripe | null = null;

export function getStripe() {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
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

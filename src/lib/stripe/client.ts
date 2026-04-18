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

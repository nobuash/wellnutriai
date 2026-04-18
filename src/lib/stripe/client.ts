import Stripe from 'stripe';
import { PLANS, type PlanInterval } from '@/lib/mercadopago/client';

let stripe: Stripe | null = null;

export function getStripe() {
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);
  }
  return stripe;
}

export function planAmountCents(interval: PlanInterval): number {
  return Math.round(PLANS[interval].amount * 100);
}

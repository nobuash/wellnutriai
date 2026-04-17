import { MercadoPagoConfig, Payment, Preference, PreApproval } from 'mercadopago';

function getMpClient() {
  if (!process.env.MP_ACCESS_TOKEN) {
    throw new Error('MP_ACCESS_TOKEN não configurado');
  }
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
}

export function getPreference() {
  return new Preference(getMpClient());
}

export function getPreApproval() {
  return new PreApproval(getMpClient());
}

export function getPayment() {
  return new Payment(getMpClient());
}

export type PlanInterval = 'monthly' | 'quarterly' | 'annual';

export const PLANS: Record<PlanInterval, {
  label: string;
  displayLabel: string;
  amount: number;
  monthlyAmount: number;
  currency: 'BRL';
  durationDays: number;
  frequencyMonths: number;
  discountPercent: number;
}> = {
  monthly: {
    label: 'WellNutriAI PRO — Mensal',
    displayLabel: 'Mensal',
    amount: 29.90,
    monthlyAmount: 29.90,
    currency: 'BRL',
    durationDays: 30,
    frequencyMonths: 1,
    discountPercent: 0,
  },
  quarterly: {
    label: 'WellNutriAI PRO — Trimestral',
    displayLabel: 'Trimestral',
    amount: 74.45,
    monthlyAmount: 24.82,
    currency: 'BRL',
    durationDays: 90,
    frequencyMonths: 3,
    discountPercent: 17,
  },
  annual: {
    label: 'WellNutriAI PRO — Anual',
    displayLabel: 'Anual',
    amount: 204.52,
    monthlyAmount: 17.04,
    currency: 'BRL',
    durationDays: 365,
    frequencyMonths: 12,
    discountPercent: 43,
  },
};

// Backwards compat
export const PRO_PLAN = PLANS.monthly;

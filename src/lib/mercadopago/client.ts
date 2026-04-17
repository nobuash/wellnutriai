import { MercadoPagoConfig, PreApproval } from 'mercadopago';

if (!process.env.MP_ACCESS_TOKEN) {
  throw new Error('MP_ACCESS_TOKEN não configurado no .env.local');
}

export const mpClient = new MercadoPagoConfig({
  accessToken: process.env.MP_ACCESS_TOKEN,
});

export const preApproval = new PreApproval(mpClient);

/** Valor e moeda do plano PRO */
export const PRO_PLAN = {
  amount: 29.9,
  currency: 'BRL',
  label: 'WellNutriAI PRO — Assinatura Mensal',
} as const;

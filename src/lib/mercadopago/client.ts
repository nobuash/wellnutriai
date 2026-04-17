import { MercadoPagoConfig, Payment, PreApproval } from 'mercadopago';

function getMpClient() {
  if (!process.env.MP_ACCESS_TOKEN) {
    throw new Error('MP_ACCESS_TOKEN não configurado');
  }
  return new MercadoPagoConfig({ accessToken: process.env.MP_ACCESS_TOKEN });
}

export function getPreApproval() {
  return new PreApproval(getMpClient());
}

export function getPayment() {
  return new Payment(getMpClient());
}

export const PRO_PLAN = {
  amount: 29.9,
  currency: 'BRL',
  label: 'WellNutriAI PRO — 30 dias',
} as const;

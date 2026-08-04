import crypto from 'crypto';

/**
 * ID curto pra correlacionar um erro genérico mostrado ao usuário com
 * o log detalhado no servidor, sem expor a mensagem interna do
 * provedor (Stripe/Mercado Pago/Supabase) na resposta. Suporte pode
 * pedir esse ID pro usuário e localizar o log real.
 */
export function generateRequestId(): string {
  return crypto.randomBytes(6).toString('hex');
}

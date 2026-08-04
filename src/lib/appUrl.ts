/**
 * URL pública da aplicação, usada em back_urls/notification_url
 * (Mercado Pago) e return_url (Stripe Checkout).
 *
 * CONFIRMADO (round 4): três rotas (card, subscribe, pix) caíam em
 * `http://localhost:3000` quando NEXT_PUBLIC_APP_URL não estava
 * configurada, e uma quarta (stripe/intent) caía num fallback
 * DIFERENTE (`https://wellnutriai.com`) — inconsistente entre si. Em
 * produção, se a env var sumisse por engano, o Mercado Pago receberia
 * `notification_url=http://localhost:3000/...` — inalcançável a
 * partir dos servidores do MP — quebrando a ativação via webhook
 * silenciosamente (só o polling manual de /api/payment/verify
 * continuaria funcionando, mascarando o problema).
 *
 * Em produção, exige HTTPS e não usa localhost como fallback — falha
 * alto e cedo em vez de mandar uma URL inalcançável pro provedor.
 */
export function getAppUrl(): string {
  const configured = process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL;
  const isProduction = process.env.NODE_ENV === 'production';

  if (configured) {
    if (isProduction && !configured.startsWith('https://')) {
      throw new Error(
        `NEXT_PUBLIC_APP_URL/APP_URL configurada sem HTTPS em produção: "${configured}". Isso quebraria callbacks de pagamento (Stripe/Mercado Pago).`,
      );
    }
    return configured.replace(/\/$/, '');
  }

  if (isProduction) {
    throw new Error('NEXT_PUBLIC_APP_URL (ou APP_URL) não configurada em produção — obrigatória para callbacks de pagamento.');
  }

  return 'http://localhost:3000';
}

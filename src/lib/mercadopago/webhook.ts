import crypto from 'crypto';

/**
 * Verifica a assinatura do webhook enviada pelo Mercado Pago.
 * Docs: https://www.mercadopago.com.br/developers/pt/docs/your-integrations/notifications/webhooks
 */
export function verifyMPSignature(
  xSignature: string,
  xRequestId: string,
  dataId: string,
): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.warn('[webhook] MP_WEBHOOK_SECRET não configurado — verificação ignorada');
    return true; // permissivo em desenvolvimento; travar em produção
  }

  try {
    // Formato: ts=<timestamp>;v1=<hash>
    const parts = Object.fromEntries(
      xSignature.split(';').map((part) => part.split('=')),
    );
    const ts = parts['ts'];
    const v1 = parts['v1'];
    if (!ts || !v1) return false;

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  } catch {
    return false;
  }
}

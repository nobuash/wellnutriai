import crypto from 'crypto';

export function verifyMPSignature(
  xSignature: string,
  xRequestId: string,
  dataId: string,
): boolean {
  const secret = process.env.MP_WEBHOOK_SECRET;
  if (!secret) {
    console.error('[webhook] MP_WEBHOOK_SECRET não configurado — rejeitando webhook');
    return false;
  }

  try {
    const parts = Object.fromEntries(
      xSignature.split(';').map((part) => part.split('=')),
    );
    const ts = parts['ts'];
    const v1 = parts['v1'];
    if (!ts || !v1) return false;

    // Rejeita timestamps com mais de 5 minutos (replay attack)
    const age = Math.abs(Date.now() / 1000 - Number(ts));
    if (age > 300) {
      console.warn('[webhook] Timestamp expirado — possível replay attack');
      return false;
    }

    const manifest = `id:${dataId};request-id:${xRequestId};ts:${ts};`;
    const expected = crypto
      .createHmac('sha256', secret)
      .update(manifest)
      .digest('hex');

    if (v1.length !== expected.length) return false;
    return crypto.timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
  } catch {
    return false;
  }
}

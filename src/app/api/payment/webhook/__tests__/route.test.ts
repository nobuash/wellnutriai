import crypto from 'crypto';
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const SECRET = 'test-mp-webhook-secret-do-not-use-in-prod';

// Isola a rota das dependências externas reais (Supabase, MP SDK) —
// mesma filosofia dos outros testes deste projeto (nunca I/O real).
// O teste continua exercitando a verificação de assinatura DE VERDADE
// (verifyMPSignature não é mockado), só a camada de persistência/API
// externa é substituída.
const withWebhookIdempotencyMock = vi.fn(async (_params: unknown, handler: () => Promise<void>) => {
  await handler();
  return 'processed';
});

vi.mock('@/lib/webhookIdempotency', () => ({
  withWebhookIdempotency: (...args: [unknown, () => Promise<void>]) => withWebhookIdempotencyMock(...args),
}));

vi.mock('@/lib/mercadopago/activatePayment', () => ({
  activateMpPayment: vi.fn(async () => ({ outcome: 'activated', expiresAt: '2026-08-01T00:00:00.000Z' })),
}));

vi.mock('@/lib/mercadopago/client', () => ({
  getPayment: () => ({ get: vi.fn(async () => ({ id: 1, status: 'approved' })) }),
  getPreApproval: () => ({ get: vi.fn(), update: vi.fn() }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: () => ({
      upsert: () => Promise.resolve({ data: null, error: null }),
      update: () => ({ eq: () => Promise.resolve({ data: null, error: null }) }),
    }),
  }),
}));

vi.mock('@/lib/subscriptionCache', () => ({
  recalculateVisualPlanCache: vi.fn(async () => {}),
}));

function manifestFor(dataId: string, requestId: string, ts: string): string {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  return parts.join(';') + ';';
}

function computeV1(manifest: string): string {
  return crypto.createHmac('sha256', SECRET).update(manifest).digest('hex');
}

function buildRequest({
  signature,
  requestId = 'req-abc',
  dataId = '123456789',
  type = 'payment',
  bodyDataId,
}: {
  signature: string | null;
  requestId?: string | null;
  dataId?: string;
  type?: string;
  bodyDataId?: string;
}): NextRequest {
  const url = `https://wellnutriai.com/api/payment/webhook?data.id=${dataId}&type=${type}`;
  const headers: Record<string, string> = {};
  if (signature !== null) headers['x-signature'] = signature;
  if (requestId !== null) headers['x-request-id'] = requestId;

  const body = JSON.stringify({
    id: 999888777, // notificationId
    type,
    data: { id: bodyDataId ?? dataId },
  });

  return new NextRequest(url, { method: 'POST', headers, body });
}

describe('POST /api/payment/webhook (Mercado Pago)', () => {
  const originalSecret = process.env.MP_WEBHOOK_SECRET;
  const NOW_MS = 1_800_000_000_000;
  const originalDateNow = Date.now;

  beforeEach(() => {
    process.env.MP_WEBHOOK_SECRET = SECRET;
    Date.now = () => NOW_MS;
    withWebhookIdempotencyMock.mockClear();
  });

  afterEach(() => {
    process.env.MP_WEBHOOK_SECRET = originalSecret;
    Date.now = originalDateNow;
    vi.resetModules();
  });

  it('webhook com assinatura válida chega ao handler de processamento (200)', async () => {
    const { POST } = await import('@/app/api/payment/webhook/route');

    const dataId = '123456789';
    const requestId = 'req-abc';
    const ts = String(NOW_MS - 1000);
    const v1 = computeV1(manifestFor(dataId, requestId, ts));
    const signature = `ts=${ts},v1=${v1}`;

    const req = buildRequest({ signature, requestId, dataId });
    const res = await POST(req);

    expect(res.status).toBe(200);
    expect(withWebhookIdempotencyMock).toHaveBeenCalledTimes(1);
  });

  it('webhook com assinatura inválida retorna 401 e NUNCA chega ao handler de processamento', async () => {
    const { POST } = await import('@/app/api/payment/webhook/route');

    const req = buildRequest({ signature: 'ts=1234,v1=' + 'f'.repeat(64) });
    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(withWebhookIdempotencyMock).not.toHaveBeenCalled();
  });

  it('webhook sem header x-signature retorna 401 e não chega ao handler', async () => {
    const { POST } = await import('@/app/api/payment/webhook/route');

    const req = buildRequest({ signature: null });
    const res = await POST(req);

    expect(res.status).toBe(401);
    expect(withWebhookIdempotencyMock).not.toHaveBeenCalled();
  });

  it('data.id do corpo divergente do query param não engana a verificação — usa o valor da URL', async () => {
    const { POST } = await import('@/app/api/payment/webhook/route');

    const dataId = '123456789'; // valor real, na URL, assinado de verdade
    const requestId = 'req-abc';
    const ts = String(NOW_MS - 1000);
    // Assinatura calculada sobre o dataId da URL (o correto)
    const v1 = computeV1(manifestFor(dataId, requestId, ts));
    const signature = `ts=${ts},v1=${v1}`;

    // Corpo tenta afirmar um data.id DIFERENTE (999999999) — não deve
    // ser usado para nada, já que a URL prevalece.
    const req = buildRequest({ signature, requestId, dataId, bodyDataId: '999999999' });
    const res = await POST(req);

    // A assinatura ainda é válida (foi calculada sobre o dataId da URL,
    // que é o que a rota usa) — chega ao handler normalmente.
    expect(res.status).toBe(200);
    expect(withWebhookIdempotencyMock).toHaveBeenCalledTimes(1);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Prova que /api/payment/card usa a fonte única de ativação
// (activateMpPayment) em vez de calcular sua própria data de
// expiração — round 4, item 5. Mocka os limites da aplicação
// (Supabase, MP SDK, rate limit, consentimento) e observa como a rota
// chama activateMpPayment.

const activateMpPaymentMock = vi.fn();
const createPaymentMock = vi.fn();

vi.mock('@/lib/mercadopago/activatePayment', () => ({
  activateMpPayment: (...args: unknown[]) => activateMpPaymentMock(...args),
}));

vi.mock('@/lib/mercadopago/client', () => ({
  getPayment: () => ({ create: (...args: unknown[]) => createPaymentMock(...args) }),
  PLANS: {
    monthly: { amount: 29.9, currency: 'BRL', durationDays: 30, label: 'Mensal', displayLabel: 'Mensal' },
    quarterly: { amount: 74.45, currency: 'BRL', durationDays: 90, label: 'Trimestral', displayLabel: 'Trimestral' },
    annual: { amount: 204.52, currency: 'BRL', durationDays: 365, label: 'Anual', displayLabel: 'Anual' },
  },
}));

vi.mock('@/lib/distributedRateLimit', () => ({
  checkDistributedRateLimit: vi.fn(async () => true),
}));

vi.mock('@/lib/consentCheck', () => ({
  requireCurrentConsent: vi.fn(async () => ({ ok: true })),
  consentReasonMessage: vi.fn(() => 'consent error'),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          single: async () => ({ data: { name: 'Fulano de Tal', email: 'user@example.com' } }),
        }),
      }),
    }),
  }),
}));

function buildBody() {
  return {
    token: 'card-token-xyz',
    installments: 1,
    payment_method_id: 'master',
    payer: { email: 'user@example.com' },
    planInterval: 'monthly',
  };
}

function buildRequest(body: unknown): Request {
  return new Request('https://wellnutriai.com/api/payment/card', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/payment/card', () => {
  beforeEach(() => {
    // Rota agora falha cedo (503) se MP_ACCESS_TOKEN não estiver
    // configurado — ver next.config.js / src/app/api/payment/card/route.ts.
    // Esses testes cobrem a lógica de pagamento assumindo MP configurado,
    // não essa checagem, então precisam do env var presente.
    process.env.MP_ACCESS_TOKEN = 'TEST-mock-access-token';
    activateMpPaymentMock.mockReset();
    createPaymentMock.mockReset();
  });

  afterEach(() => {
    delete process.env.MP_ACCESS_TOKEN;
    vi.resetModules();
  });

  it('cobrança aprovada chama activateMpPayment com o id do pagamento e o userId — não calcula expiração própria', async () => {
    createPaymentMock.mockResolvedValue({ id: 555, status: 'approved', status_detail: 'accredited' });
    activateMpPaymentMock.mockResolvedValue({ outcome: 'activated', expiresAt: '2026-09-01T00:00:00.000Z' });

    const { POST } = await import('@/app/api/payment/card/route');
    const res = await POST(buildRequest(buildBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe('approved');
    expect(activateMpPaymentMock).toHaveBeenCalledTimes(1);
    expect(activateMpPaymentMock).toHaveBeenCalledWith(555, 'user-1');
  });

  it('cobrança aprovada mas ativação recusada (ex: amount_mismatch) retorna erro em vez de fingir sucesso', async () => {
    createPaymentMock.mockResolvedValue({ id: 556, status: 'approved', status_detail: 'accredited' });
    activateMpPaymentMock.mockResolvedValue({ outcome: 'amount_mismatch' });

    const { POST } = await import('@/app/api/payment/card/route');
    const res = await POST(buildRequest(buildBody()));

    expect(res.status).toBe(502);
    expect(activateMpPaymentMock).toHaveBeenCalledTimes(1);
  });

  it('cobrança rejeitada pelo MP não chama activateMpPayment', async () => {
    createPaymentMock.mockResolvedValue({ id: 557, status: 'rejected', status_detail: 'cc_rejected_insufficient_amount' });

    const { POST } = await import('@/app/api/payment/card/route');
    const res = await POST(buildRequest(buildBody()));
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.status).toBe('rejected');
    expect(activateMpPaymentMock).not.toHaveBeenCalled();
  });

  it('retorna 503 sem chamar o Mercado Pago quando MP_ACCESS_TOKEN não está configurado', async () => {
    delete process.env.MP_ACCESS_TOKEN;

    const { POST } = await import('@/app/api/payment/card/route');
    const res = await POST(buildRequest(buildBody()));

    expect(res.status).toBe(503);
    expect(createPaymentMock).not.toHaveBeenCalled();
    expect(activateMpPaymentMock).not.toHaveBeenCalled();
  });
});

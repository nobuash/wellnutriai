import { beforeEach, describe, expect, it, vi } from 'vitest';

// A garantia de atomicidade real (duas chamadas concorrentes à RPC
// claim_webhook_event nunca reivindicam o mesmo evento) vive na
// semântica de UPDATE...WHERE...RETURNING de instrução única do
// Postgres — documentada em
// supabase/migrations/022_atomic_webhook_claim.sql — e não pode ser
// provada por um teste unitário sem um Postgres real (fora do escopo
// desta suíte, que nunca faz I/O real; ver vitest.config.ts).
//
// O que ESTE teste prova: dado que a RPC devolve exatamente o
// resultado que a semântica descrita promete (uma chamada ganha o
// claim, a outra não), a camada de aplicação (withWebhookIdempotency)
// interpreta isso corretamente — só uma das duas chamadas concorrentes
// executa o handler de efeito comercial, nunca as duas.

const rpcMock = vi.fn();
const updateMock = vi.fn(() => ({ eq: vi.fn(async () => ({ data: null, error: null })) }));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    rpc: (...args: unknown[]) => rpcMock(...args),
    from: () => ({ update: updateMock }),
  }),
}));

describe('withWebhookIdempotency — concorrência (RPC mockada)', () => {
  beforeEach(() => {
    rpcMock.mockReset();
    updateMock.mockClear();
  });

  it('duas chamadas "simultâneas" pro mesmo evento: só uma executa o handler', async () => {
    // Simula o que a RPC atômica real devolveria numa corrida de
    // verdade: a primeira chamada ganha o claim, a segunda não (nem
    // "already_processed", já que ela chegou ANTES da primeira
    // terminar — está genuinamente em andamento).
    rpcMock
      .mockResolvedValueOnce({ data: [{ event_id: 'evt-1', claimed: true, already_processed: false }], error: null })
      .mockResolvedValueOnce({ data: [{ event_id: 'evt-1', claimed: false, already_processed: false }], error: null });

    const { withWebhookIdempotency } = await import('@/lib/webhookIdempotency');

    let effectRuns = 0;
    const handler = async () => {
      effectRuns += 1;
      // Simula trabalho real acontecendo (ativação de pagamento) —
      // dá tempo pra segunda chamada "chegar" antes da primeira terminar.
      await new Promise((resolve) => setTimeout(resolve, 5));
    };

    const [outcomeA, outcomeB] = await Promise.all([
      withWebhookIdempotency(
        { provider: 'mercadopago', eventKey: 'evt-1', eventType: 'payment' },
        handler,
      ),
      withWebhookIdempotency(
        { provider: 'mercadopago', eventKey: 'evt-1', eventType: 'payment' },
        handler,
      ),
    ]);

    // O efeito comercial (handler) rodou UMA ÚNICA VEZ, nunca duas.
    expect(effectRuns).toBe(1);

    const outcomes = [outcomeA, outcomeB].sort();
    expect(outcomes).toEqual(['processed', 'skipped_in_progress']);
  });

  it('reentrega de um evento já processado nunca reexecuta o handler', async () => {
    rpcMock.mockResolvedValue({ data: [{ event_id: 'evt-2', claimed: false, already_processed: true }], error: null });

    const { withWebhookIdempotency } = await import('@/lib/webhookIdempotency');

    let effectRuns = 0;
    const outcome = await withWebhookIdempotency(
      { provider: 'stripe', eventKey: 'evt-2', eventType: 'invoice.payment_succeeded' },
      async () => { effectRuns += 1; },
    );

    expect(effectRuns).toBe(0);
    expect(outcome).toBe('skipped_duplicate');
  });

  it('se a RPC de claim falhar (erro de infraestrutura), não executa o handler e retorna failed', async () => {
    rpcMock.mockResolvedValue({ data: null, error: { message: 'connection timeout' } });

    const { withWebhookIdempotency } = await import('@/lib/webhookIdempotency');

    let effectRuns = 0;
    const outcome = await withWebhookIdempotency(
      { provider: 'stripe', eventKey: 'evt-3', eventType: 'invoice.payment_succeeded' },
      async () => { effectRuns += 1; },
    );

    expect(effectRuns).toBe(0);
    expect(outcome).toBe('failed');
  });
});

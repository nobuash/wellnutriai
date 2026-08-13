import { beforeEach, describe, expect, it, vi } from 'vitest';

// Prova, com uma tabela falsa em memória que simula o índice único
// parcial real de 023_checkout_reservations.sql (só uma reserva
// 'reserved'/'session_created' por user_id+provider), que duas
// requisições concorrentes de checkout (duplo clique / duas abas)
// nunca produzem duas Checkout Sessions efetivas. Não é um teste
// contra Postgres real — a garantia de atomicidade do índice em si é
// do Postgres; isto prova que a ROTA reage corretamente ao conflito.

interface FakeReservation {
  id: string;
  user_id: string;
  provider: string;
  plan_interval: string;
  status: string;
  idempotency_key: string;
  checkout_session_id: string | null;
  expires_at: string;
}

let reservations: FakeReservation[] = [];
let nextId = 1;

function hasActiveReservation(userId: string, provider: string): boolean {
  return reservations.some(
    (r) => r.user_id === userId && r.provider === provider && ['reserved', 'session_created'].includes(r.status),
  );
}

// Simula o armazenamento real da Stripe: a mesma sessão sempre devolve
// o mesmo client_secret, seja via create() ou um retrieve() posterior.
const createdSessions = new Map<string, { id: string; client_secret: string }>();
const createSessionMock = vi.fn(async () => {
  const session = { id: 'cs_test_session_1', client_secret: 'secret_abc' };
  createdSessions.set(session.id, session);
  return session;
});

vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({
    customers: {
      list: vi.fn(async () => ({ data: [{ id: 'cus_123' }] })),
      create: vi.fn(async () => ({ id: 'cus_123' })),
    },
    checkout: {
      sessions: {
        create: () => createSessionMock(),
        retrieve: vi.fn(async (id: string) => createdSessions.get(id) ?? { id, client_secret: null }),
      },
    },
  }),
  getStripePriceId: () => 'price_test_123',
  STRIPE_INTERVALS: { monthly: {}, quarterly: {}, annual: {} },
}));

vi.mock('@/lib/stripe/activateSubscription', () => ({
  findActiveStripeSubscription: vi.fn(async () => null),
  findStripeCustomerId: vi.fn(async () => null),
}));

vi.mock('@/lib/distributedRateLimit', () => ({
  checkDistributedRateLimit: vi.fn(async () => true),
}));

vi.mock('@/lib/consentCheck', () => ({
  requireCurrentConsent: vi.fn(async () => ({ ok: true })),
  consentReasonMessage: vi.fn(() => 'consent error'),
}));

// null = sem questionário ainda respondido (getNutritionSafetyMode(null)
// é 'standard', não bloqueia nada — o padrão nos testes de concorrência
// abaixo, que existem pra provar reserva, não o gate de perfil).
let mockQuestionnaireRow: Record<string, unknown> | null = null;

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: { getUser: async () => ({ data: { user: { id: 'user-1', email: 'user@example.com' } } }) },
    from: () => ({
      select: () => ({
        eq: () => ({
          order: () => ({
            limit: () => ({
              maybeSingle: async () => ({ data: mockQuestionnaireRow, error: null }),
            }),
          }),
        }),
      }),
    }),
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      // findStripeCustomerId (que consultaria 'subscriptions') é
      // mockado diretamente acima — só 'checkout_reservations' passa
      // por este client mockado.
      if (table !== 'checkout_reservations') throw new Error(`tabela inesperada no teste: ${table}`);
      return {
        insert: (row: Partial<FakeReservation>) => ({
          select: () => ({
            single: async () => {
              if (hasActiveReservation(row.user_id!, row.provider!)) {
                // Simula violação de unique constraint do Postgres
                // (idx_checkout_reservations_active_per_user).
                return { data: null, error: { message: 'duplicate key value violates unique constraint', code: '23505' } };
              }
              const created: FakeReservation = {
                id: `res-${nextId++}`,
                checkout_session_id: null,
                user_id: row.user_id!,
                provider: row.provider!,
                plan_interval: row.plan_interval!,
                status: row.status!,
                idempotency_key: row.idempotency_key!,
                expires_at: row.expires_at!,
              };
              reservations.push(created);
              return { data: { id: created.id, idempotency_key: created.idempotency_key }, error: null };
            },
          }),
        }),
        select: () => ({
          eq: (_k1: string, v1: string) => ({
            eq: (_k2: string, v2: string) => ({
              in: (_k3: string, statuses: string[]) => ({
                maybeSingle: async () => {
                  const found = reservations.find(
                    (r) => r.user_id === v1 && r.provider === v2 && statuses.includes(r.status),
                  );
                  return { data: found ?? null, error: null };
                },
              }),
            }),
          }),
        }),
        update: (patch: Partial<FakeReservation>) => ({
          eq: async (_k: string, id: string) => {
            const row = reservations.find((r) => r.id === id);
            if (row) Object.assign(row, patch);
            return { data: null, error: null };
          },
        }),
      };
    },
  }),
}));

function buildRequest(): Request {
  return new Request('https://wellnutriai.com/api/payment/stripe/intent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ planInterval: 'monthly' }),
  });
}

describe('POST /api/payment/stripe/intent — concorrência de checkout', () => {
  beforeEach(() => {
    reservations = [];
    nextId = 1;
    createdSessions.clear();
    createSessionMock.mockClear();
    mockQuestionnaireRow = null;
  });

  it('duas requisições concorrentes (duplo clique) criam no máximo uma Checkout Session efetiva', async () => {
    const { POST } = await import('@/app/api/payment/stripe/intent/route');

    const [resA, resB] = await Promise.all([POST(buildRequest()), POST(buildRequest())]);
    const [jsonA, jsonB] = await Promise.all([resA.json(), resB.json()]);

    // Só UMA sessão real foi criada na Stripe, mesmo com duas
    // requisições batendo ao mesmo tempo.
    expect(createSessionMock).toHaveBeenCalledTimes(1);

    // Uma das duas respostas tem sucesso (clientSecret); a outra é a
    // mesma sessão devolvida OU um erro 409 de "tentativa em andamento"
    // — nunca uma segunda sessão nova.
    const succeeded = [jsonA, jsonB].filter((j) => j.clientSecret);
    expect(succeeded.length).toBeGreaterThanOrEqual(1);

    if (succeeded.length === 2) {
      // Se as duas "tiveram sucesso", precisam ser a MESMA sessão.
      expect(jsonA.clientSecret).toBe(jsonB.clientSecret);
    } else {
      const failed = [jsonA, jsonB].find((j) => !j.clientSecret);
      expect(failed?.error).toBeTruthy();
    }

    // Nunca duas reservas simultaneamente "ativas" no fim.
    const activeCount = reservations.filter((r) => ['reserved', 'session_created'].includes(r.status)).length;
    expect(activeCount).toBeLessThanOrEqual(1);
  });

  it('retry após reserva concluída (session_created) recebe a mesma sessão, não uma nova', async () => {
    const { POST } = await import('@/app/api/payment/stripe/intent/route');

    const res1 = await POST(buildRequest());
    const json1 = await res1.json();
    expect(json1.clientSecret).toBeTruthy();
    expect(createSessionMock).toHaveBeenCalledTimes(1);

    // Segunda tentativa do MESMO usuário antes de completar o checkout.
    const res2 = await POST(buildRequest());
    const json2 = await res2.json();

    // Não criou uma segunda sessão nova na Stripe.
    expect(createSessionMock).toHaveBeenCalledTimes(1);
    if (json2.clientSecret) {
      expect(json2.clientSecret).toBe(json1.clientSecret);
    } else {
      expect(json2.error).toBeTruthy();
    }
  });
});

describe('POST /api/payment/stripe/intent — perfil de alto risco não inicia checkout', () => {
  beforeEach(() => {
    reservations = [];
    nextId = 1;
    createdSessions.clear();
    createSessionMock.mockClear();
    mockQuestionnaireRow = null;
  });

  it('bloqueia com 422 e nunca cria Checkout Session quando o questionário indica condição de alto risco', async () => {
    mockQuestionnaireRow = { diabetes_type: 'type2', is_pregnant: false, is_breastfeeding: false, has_kidney_disease: false, has_liver_disease: false, has_eating_disorder_history: false, has_severe_allergy: false, uses_insulin: false, other_medical_condition: null };

    const { POST } = await import('@/app/api/payment/stripe/intent/route');
    const res = await POST(buildRequest());
    const json = await res.json();

    expect(res.status).toBe(422);
    expect(json.restrictedProfile).toBe(true);
    expect(createSessionMock).not.toHaveBeenCalled();
  });

  it('não bloqueia quando o questionário não tem nenhuma condição de risco', async () => {
    mockQuestionnaireRow = { diabetes_type: 'none', is_pregnant: false, is_breastfeeding: false, has_kidney_disease: false, has_liver_disease: false, has_eating_disorder_history: false, has_severe_allergy: false, uses_insulin: false, other_medical_condition: null };

    const { POST } = await import('@/app/api/payment/stripe/intent/route');
    const res = await POST(buildRequest());
    const json = await res.json();

    expect(json.clientSecret).toBeTruthy();
    expect(createSessionMock).toHaveBeenCalledTimes(1);
  });
});

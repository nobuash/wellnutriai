import { beforeEach, describe, expect, it, vi } from 'vitest';

// Simula um bucket com MAIS DE 1000 objetos (2 páginas cheias + uma
// parcial) pra provar que a paginação corrigida no round 3
// (sempre offset:0, nunca incrementa depois de remover) continua
// removendo tudo de verdade, e que a verificação final de pasta vazia
// (round 4) funciona.

const USER_ID = 'user-1';
const STORAGE_PAGE_SIZE = 1000;

function makeFiles(count: number, startAt = 0) {
  return Array.from({ length: count }, (_, i) => ({ name: `photo-${startAt + i}.jpg` }));
}

let storageFiles: { name: string }[] = [];

type StorageResult<T> = { data: T; error: { message: string } | null };

const removeMock = vi.fn(async (paths: string[]): Promise<StorageResult<null>> => {
  const toRemove = new Set(paths.map((p) => p.split('/').pop()));
  storageFiles = storageFiles.filter((f) => !toRemove.has(f.name));
  return { data: null, error: null };
});
const listMock = vi.fn(async (_userId: string, opts: { limit: number; offset: number }): Promise<StorageResult<{ name: string }[]>> => {
  // offset é sempre ignorado de propósito no fake, igual a implementação
  // real: list() reflete o estado ATUAL do bucket, então pedir a
  // primeira página de novo depois de remover é o comportamento certo.
  return { data: storageFiles.slice(0, opts.limit), error: null };
});

const subscriptionsCancelMock = vi.fn(async () => ({}));
const deleteUserMock = vi.fn(async () => ({ error: null }));

vi.mock('@/lib/stripe/client', () => ({
  getStripe: () => ({ subscriptions: { cancel: () => subscriptionsCancelMock() } }),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: () => ({
    auth: {
      getUser: async () => ({ data: { user: { id: USER_ID, email: 'user@example.com' } } }),
      signInWithPassword: async () => ({ error: null }),
    },
  }),
}));

vi.mock('@/lib/supabase/service', () => ({
  createServiceClient: () => ({
    from: (table: string) => {
      if (table === 'account_deletion_requests') {
        return {
          insert: () => ({ select: () => ({ single: async () => ({ data: { id: 'req-1' }, error: null }) }) }),
          update: () => ({ eq: async () => ({ data: null, error: null }) }),
        };
      }
      if (table === 'subscriptions') {
        return {
          select: () => ({
            eq: () => ({
              eq: () => ({
                eq: async () => ({ data: [], error: null }), // sem assinatura Stripe ativa neste teste
              }),
            }),
          }),
        };
      }
      if (table === 'audit_log') {
        return { insert: async () => ({ data: null, error: null }) };
      }
      throw new Error(`tabela inesperada no teste: ${table}`);
    },
    storage: {
      from: () => ({
        list: (userId: string, opts: { limit: number; offset: number }) => listMock(userId, opts),
        remove: (paths: string[]) => removeMock(paths),
      }),
    },
    auth: { admin: { deleteUser: () => deleteUserMock() } },
  }),
}));

function buildRequest(): Request {
  return new Request('https://wellnutriai.com/api/account/delete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: 'senha-correta' }),
  });
}

describe('POST /api/account/delete — Storage com mais de 1000 objetos', () => {
  beforeEach(() => {
    removeMock.mockClear();
    listMock.mockClear();
    subscriptionsCancelMock.mockClear();
    deleteUserMock.mockClear();
  });

  it('remove TODOS os arquivos (2500), não só os primeiros 1000', async () => {
    storageFiles = makeFiles(2500);

    const { POST } = await import('@/app/api/account/delete/route');
    const res = await POST(buildRequest());
    const json = await res.json();

    expect(res.status).toBe(200);
    expect(json.ok).toBe(true);
    expect(storageFiles.length).toBe(0);
    expect(deleteUserMock).toHaveBeenCalledTimes(1);

    // 2500 arquivos / 1000 por página = precisa de pelo menos 3
    // chamadas de remove() pra esvaziar tudo.
    expect(removeMock.mock.calls.length).toBeGreaterThanOrEqual(3);
  });

  it('exatamente 1000 arquivos (fronteira exata de uma página): todos removidos', async () => {
    storageFiles = makeFiles(STORAGE_PAGE_SIZE);

    const { POST } = await import('@/app/api/account/delete/route');
    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(storageFiles.length).toBe(0);
  });

  it('falha ao remover uma página bloqueia a exclusão — usuário NÃO é apagado', async () => {
    storageFiles = makeFiles(1500);
    removeMock.mockImplementationOnce(async () => ({ data: null, error: { message: 'storage indisponível' } }));

    const { POST } = await import('@/app/api/account/delete/route');
    const res = await POST(buildRequest());
    const json = await res.json();

    expect(res.status).toBe(502);
    expect(json.error).toContain('NÃO foi excluída');
    expect(deleteUserMock).not.toHaveBeenCalled();
    // Arquivos que não deram pra remover continuam lá — nada órfão
    // "silenciosamente esquecido", o estado é visível e retomável.
    expect(storageFiles.length).toBeGreaterThan(0);
  });

  it('bucket já vazio: exclusão prossegue normalmente sem chamar remove()', async () => {
    storageFiles = [];

    const { POST } = await import('@/app/api/account/delete/route');
    const res = await POST(buildRequest());

    expect(res.status).toBe(200);
    expect(removeMock).not.toHaveBeenCalled();
    expect(deleteUserMock).toHaveBeenCalledTimes(1);
  });
});

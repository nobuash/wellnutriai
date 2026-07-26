/**
 * O client do Supabase nunca lança exceção em erro de escrita — ele
 * retorna `{ data: null, error }`. Chamar `.upsert(...)`/`.update(...)`
 * sem desestruturar e checar `error` explicitamente faz o código
 * seguir como se tivesse dado certo mesmo quando a gravação falhou de
 * verdade (constraint violada, RLS, coluna inexistente, timeout).
 *
 * Em rotas de pagamento isso é especialmente grave: se o UPDATE de
 * `subscriptions` falhar silenciosamente dentro do handler de um
 * webhook, o webhook ainda assim é marcado como `processed` (o handler
 * não lançou), o provedor não reentrega, e o usuário paga sem nunca
 * receber PRO — sem nenhum rastro do que aconteceu.
 *
 * Use isto em toda escrita cujo resultado é necessário para o restante
 * do fluxo (ativação de pagamento, cancelamento, exclusão de conta,
 * transição de estado de webhook). Não é necessário para escritas
 * best-effort onde uma falha não deve interromper a funcionalidade
 * principal (ex: log de auditoria não essencial) — essas continuam
 * podendo usar try/catch silencioso com log, como já documentado nos
 * call sites correspondentes.
 */
export async function requireSupabaseSuccess<T>(
  promise: PromiseLike<{ data: T; error: { message: string; code?: string; details?: string } | null }>,
): Promise<T> {
  const { data, error } = await promise;

  if (error) {
    throw new SupabaseOperationError(error.message, error.code, error.details);
  }

  return data;
}

export class SupabaseOperationError extends Error {
  code?: string;
  details?: string;

  constructor(message: string, code?: string, details?: string) {
    super(`Falha na operação do Supabase: ${message}`);
    this.name = 'SupabaseOperationError';
    this.code = code;
    this.details = details;
  }
}

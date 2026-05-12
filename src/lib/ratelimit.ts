/**
 * Rate limiter em memória por instância serverless.
 *
 * Limitação: cada instância Vercel tem seu próprio estado.
 * Para rate limiting distribuído em produção de alta escala,
 * migre para Upstash Redis (@upstash/ratelimit + @upstash/redis).
 * Para MVP/early-stage com tráfego moderado, esta implementação
 * protege contra burst attacks dentro de uma mesma instância quente.
 */

interface Entry {
  count: number;
  resetAt: number;
}

const store = new Map<string, Entry>();

// Limpa entradas expiradas a cada 5 minutos para evitar memory leak
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of store.entries()) {
    if (now > val.resetAt) store.delete(key);
  }
}, 5 * 60 * 1000);

/**
 * Verifica se a chave ainda está dentro do limite.
 * @param key    Identificador único (ex: `chat:${userId}`)
 * @param max    Máximo de requisições permitidas na janela
 * @param windowSec Tamanho da janela em segundos
 * @returns true se permitido, false se bloqueado
 */
export function rateLimit(key: string, max: number, windowSec: number): boolean {
  const now = Date.now();
  const entry = store.get(key);

  if (!entry || now > entry.resetAt) {
    store.set(key, { count: 1, resetAt: now + windowSec * 1000 });
    return true;
  }

  if (entry.count >= max) return false;

  entry.count++;
  return true;
}

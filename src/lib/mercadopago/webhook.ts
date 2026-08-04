import crypto from 'crypto';

const MAX_AGE_MS = 5 * 60 * 1000; // 5 minutos — proteção contra replay

interface ParsedSignatureHeader {
  ts: string;
  v1: string;
}

/**
 * O header x-signature do Mercado Pago é separado por VÍRGULA, ex:
 * "ts=1704908010,v1=618c8534...". Isso é diferente do MANIFESTO (a
 * string que é assinada), que usa ponto e vírgula como separador
 * interno de campos ("id:123;request-id:456;ts:789;") — são coisas
 * distintas, fáceis de confundir.
 *
 * BUG CONFIRMADO (round 4): a versão anterior fazia
 * `xSignature.split(';')`, que nunca separa nada num header
 * comma-separated de verdade — `parts['v1']` ficava sempre undefined
 * e todo webhook real do MP era rejeitado por assinatura "ausente".
 *
 * Divide cada par pelo PRIMEIRO '=' (não por split('=') sem limite,
 * que quebraria se o valor em si contivesse '=') e aplica trim() nas
 * duas partes — tolera espaços ao redor de vírgulas/iguais que alguns
 * proxies/gateways podem introduzir.
 */
function parseSignatureHeader(xSignature: string): ParsedSignatureHeader | null {
  const fields: Record<string, string> = {};

  for (const rawPart of xSignature.split(',')) {
    const eqIndex = rawPart.indexOf('=');
    if (eqIndex === -1) continue;
    const key = rawPart.slice(0, eqIndex).trim();
    const value = rawPart.slice(eqIndex + 1).trim();
    if (key) fields[key] = value;
  }

  if (!fields.ts || !fields.v1) return null;
  return { ts: fields.ts, v1: fields.v1 };
}

/**
 * Constrói o manifesto HMAC exatamente como o Mercado Pago o assina.
 * Campos ausentes (request-id, por exemplo, quando o header não foi
 * enviado) são OMITIDOS inteiramente, nunca viram um valor vazio
 * (`request-id:;`) — incluir um campo vazio no manifesto produz uma
 * string diferente da que o MP realmente assinou, invalidando a
 * verificação para notificações legítimas que não trazem esse header.
 */
function buildManifest(dataId: string, xRequestId: string, ts: string): string {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (xRequestId) parts.push(`request-id:${xRequestId}`);
  parts.push(`ts:${ts}`);
  return parts.join(';') + ';';
}

/**
 * Verifica a assinatura de um webhook do Mercado Pago.
 *
 * `dataId` deve vir dos QUERY PARAMETERS da URL da notificação
 * (`data.id`/`id`), não do corpo (`body.data.id`) — é o valor dos
 * query params que o MP efetivamente assina. Usar o valor do corpo
 * (não coberto pela assinatura) abriria uma janela para um atacante
 * forjar um `data.id` diferente no corpo mantendo uma assinatura
 * válida calculada sobre o valor da URL (confused deputy). O chamador
 * (src/app/api/payment/webhook/route.ts) já prioriza os query params
 * ao montar `dataId` e usa o MESMO valor tanto para verificar a
 * assinatura quanto para buscar/ativar o pagamento — nunca dois
 * valores diferentes.
 *
 * ⚠️ NÃO VERIFICADO CONTRA A DOCUMENTAÇÃO AO VIVO DO MERCADO PAGO
 * (sem acesso à internet nesta sessão): esta implementação assume que
 * `ts` vem em milissegundos, comparando direto contra `Date.now()`
 * sem dividir por 1000. Há uma tensão real aqui — outros exemplos já
 * vistos de integrações com o MP sugerem timestamp em segundos. Teste
 * contra uma notificação real do MP (ou o simulador de webhooks do
 * painel do MP) antes de confiar cegamente nisto em produção; se o
 * timestamp real vier em segundos, esta função vai rejeitar 100% dos
 * webhooks legítimos como "expirados". O log de aviso abaixo inclui a
 * idade calculada (nunca o ts/segredo/assinatura em si) para ajudar a
 * diagnosticar isso rapidamente em produção.
 */
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
    const parsed = parseSignatureHeader(xSignature);
    if (!parsed) return false;
    const { ts, v1 } = parsed;

    const tsNumber = Number(ts);
    if (!Number.isFinite(tsNumber)) return false;

    const age = Math.abs(Date.now() - tsNumber);
    if (age > MAX_AGE_MS) {
      console.warn(`[webhook] timestamp do Mercado Pago fora da tolerância (${Math.round(age / 1000)}s de diferença) — rejeitado (replay, relógio desalinhado, ou unidade de tempo errada — ver comentário em src/lib/mercadopago/webhook.ts)`);
      return false;
    }

    const manifest = buildManifest(dataId, xRequestId, ts);
    const expectedHex = crypto.createHmac('sha256', secret).update(manifest).digest('hex');

    // v1 precisa ser hex válido do mesmo tamanho antes de decodificar —
    // timingSafeEqual lança se os buffers tiverem tamanhos diferentes,
    // e Buffer.from(str, 'hex') trunca silenciosamente em caracteres
    // inválidos em vez de lançar, então validamos o formato primeiro.
    if (v1.length !== expectedHex.length || !/^[0-9a-f]+$/i.test(v1)) return false;

    const v1Buf = Buffer.from(v1, 'hex');
    const expectedBuf = Buffer.from(expectedHex, 'hex');
    if (v1Buf.length !== expectedBuf.length) return false;

    return crypto.timingSafeEqual(v1Buf, expectedBuf);
  } catch {
    return false;
  }
}

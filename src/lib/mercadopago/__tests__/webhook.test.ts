import crypto from 'crypto';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { verifyMPSignature } from '@/lib/mercadopago/webhook';

const SECRET = 'test-mp-webhook-secret-do-not-use-in-prod';

function computeV1(manifest: string, secret: string = SECRET): string {
  return crypto.createHmac('sha256', secret).update(manifest).digest('hex');
}

/** Monta o manifesto exatamente como a implementação — usado só para
 * gerar fixtures de teste válidas, nunca importado do código de
 * produção (garante que o teste não valida contra si mesmo). */
function manifestFor(dataId: string, requestId: string, ts: string): string {
  const parts: string[] = [];
  if (dataId) parts.push(`id:${dataId}`);
  if (requestId) parts.push(`request-id:${requestId}`);
  parts.push(`ts:${ts}`);
  return parts.join(';') + ';';
}

function buildHeader(ts: string, v1: string, order: 'ts-first' | 'v1-first' = 'ts-first'): string {
  return order === 'ts-first' ? `ts=${ts},v1=${v1}` : `v1=${v1},ts=${ts}`;
}

describe('verifyMPSignature', () => {
  const DATA_ID = '123456789';
  const REQUEST_ID = 'req-abc-123';
  const NOW_MS = 1_800_000_000_000; // fixo, para não depender do relógio real

  const originalSecret = process.env.MP_WEBHOOK_SECRET;
  const originalDateNow = Date.now;

  beforeEach(() => {
    process.env.MP_WEBHOOK_SECRET = SECRET;
    Date.now = () => NOW_MS;
  });

  afterEach(() => {
    process.env.MP_WEBHOOK_SECRET = originalSecret;
    Date.now = originalDateNow;
  });

  it('assinatura válida (ts em milissegundos, dentro da tolerância) é aceita', () => {
    const ts = String(NOW_MS - 1000); // 1s atrás
    const manifest = manifestFor(DATA_ID, REQUEST_ID, ts);
    const v1 = computeV1(manifest);
    const header = buildHeader(ts, v1);

    expect(verifyMPSignature(header, REQUEST_ID, DATA_ID)).toBe(true);
  });

  it('hash (v1) inválido é rejeitado', () => {
    const ts = String(NOW_MS - 1000);
    const header = buildHeader(ts, 'f'.repeat(64)); // hex válido, mas hash errado

    expect(verifyMPSignature(header, REQUEST_ID, DATA_ID)).toBe(false);
  });

  it('timestamp expirado (fora da janela de 5 minutos) é rejeitado', () => {
    const ts = String(NOW_MS - 10 * 60 * 1000); // 10 minutos atrás
    const manifest = manifestFor(DATA_ID, REQUEST_ID, ts);
    const v1 = computeV1(manifest);
    const header = buildHeader(ts, v1);

    expect(verifyMPSignature(header, REQUEST_ID, DATA_ID)).toBe(false);
  });

  it('timestamp no futuro além da tolerância também é rejeitado (não só no passado)', () => {
    const ts = String(NOW_MS + 10 * 60 * 1000);
    const manifest = manifestFor(DATA_ID, REQUEST_ID, ts);
    const v1 = computeV1(manifest);
    const header = buildHeader(ts, v1);

    expect(verifyMPSignature(header, REQUEST_ID, DATA_ID)).toBe(false);
  });

  it('header sem v1 é rejeitado', () => {
    const ts = String(NOW_MS - 1000);
    expect(verifyMPSignature(`ts=${ts}`, REQUEST_ID, DATA_ID)).toBe(false);
  });

  it('header sem ts é rejeitado', () => {
    const v1 = computeV1(manifestFor(DATA_ID, REQUEST_ID, '1234'));
    expect(verifyMPSignature(`v1=${v1}`, REQUEST_ID, DATA_ID)).toBe(false);
  });

  it('header vazio é rejeitado', () => {
    expect(verifyMPSignature('', REQUEST_ID, DATA_ID)).toBe(false);
  });

  it('espaços entre os campos (ts= v1 , v1= v2) são tolerados via trim()', () => {
    const ts = String(NOW_MS - 1000);
    const manifest = manifestFor(DATA_ID, REQUEST_ID, ts);
    const v1 = computeV1(manifest);
    const header = ` ts = ${ts} , v1 = ${v1} `;

    expect(verifyMPSignature(header, REQUEST_ID, DATA_ID)).toBe(true);
  });

  it('ordem diferente de ts e v1 no header (v1 antes de ts) é aceita', () => {
    const ts = String(NOW_MS - 1000);
    const manifest = manifestFor(DATA_ID, REQUEST_ID, ts);
    const v1 = computeV1(manifest);
    const header = buildHeader(ts, v1, 'v1-first');

    expect(verifyMPSignature(header, REQUEST_ID, DATA_ID)).toBe(true);
  });

  it('x-request-id ausente: manifesto omite o campo (não vira request-id:;) e a assinatura ainda valida', () => {
    const ts = String(NOW_MS - 1000);
    const manifest = manifestFor(DATA_ID, '', ts); // sem request-id
    const v1 = computeV1(manifest);
    const header = buildHeader(ts, v1);

    expect(verifyMPSignature(header, '', DATA_ID)).toBe(true);
  });

  it('x-request-id ausente mas assinatura calculada COM o campo vazio (request-id:;) falha', () => {
    const ts = String(NOW_MS - 1000);
    const manifestComCampoVazio = `id:${DATA_ID};request-id:;ts:${ts};`;
    const v1 = computeV1(manifestComCampoVazio);
    const header = buildHeader(ts, v1);

    // Prova que a implementação realmente omite o campo — se ela
    // tratasse ausência como string vazia, este teste falharia (daria true).
    expect(verifyMPSignature(header, '', DATA_ID)).toBe(false);
  });

  it('data.id ausente: manifesto omite o campo e a assinatura ainda valida', () => {
    const ts = String(NOW_MS - 1000);
    const manifest = manifestFor('', REQUEST_ID, ts); // sem id
    const v1 = computeV1(manifest);
    const header = buildHeader(ts, v1);

    expect(verifyMPSignature(header, REQUEST_ID, '')).toBe(true);
  });

  it('alteração de um único caractere no manifesto (data.id diferente) invalida a assinatura', () => {
    const ts = String(NOW_MS - 1000);
    const manifest = manifestFor(DATA_ID, REQUEST_ID, ts);
    const v1 = computeV1(manifest);
    const header = buildHeader(ts, v1);

    // Mesma assinatura, mas verificando contra um dataId diferente por 1 dígito.
    expect(verifyMPSignature(header, REQUEST_ID, '123456780')).toBe(false);
  });

  it('timestamp em milissegundos (13 dígitos, próximo de Date.now()) é aceito', () => {
    const ts = String(NOW_MS); // exatamente "agora", 13 dígitos
    const manifest = manifestFor(DATA_ID, REQUEST_ID, ts);
    const v1 = computeV1(manifest);
    const header = buildHeader(ts, v1);

    expect(ts.length).toBe(13);
    expect(verifyMPSignature(header, REQUEST_ID, DATA_ID)).toBe(true);
  });

  it('timestamp tratado como segundos (10 dígitos) é rejeitado — a implementação não divide por 1000', () => {
    // Um timestamp Unix em SEGUNDOS "atual" teria ~10 dígitos
    // (ex: 1800000000). Interpretado diretamente como milissegundos
    // (sem conversão), isso corresponde a 1970 — muito além da
    // tolerância de 5 minutos.
    const tsInSeconds = String(Math.floor(NOW_MS / 1000));
    const manifest = manifestFor(DATA_ID, REQUEST_ID, tsInSeconds);
    const v1 = computeV1(manifest);
    const header = buildHeader(tsInSeconds, v1);

    expect(tsInSeconds.length).toBe(10);
    expect(verifyMPSignature(header, REQUEST_ID, DATA_ID)).toBe(false);
  });

  it('sem MP_WEBHOOK_SECRET configurado, sempre rejeita', () => {
    delete process.env.MP_WEBHOOK_SECRET;
    const ts = String(NOW_MS - 1000);
    const manifest = manifestFor(DATA_ID, REQUEST_ID, ts);
    const v1 = computeV1(manifest);
    const header = buildHeader(ts, v1);

    expect(verifyMPSignature(header, REQUEST_ID, DATA_ID)).toBe(false);
  });

  it('v1 com caracteres não-hex é rejeitado sem lançar exceção', () => {
    const ts = String(NOW_MS - 1000);
    const notHex = 'z'.repeat(64);
    const header = buildHeader(ts, notHex);

    expect(() => verifyMPSignature(header, REQUEST_ID, DATA_ID)).not.toThrow();
    expect(verifyMPSignature(header, REQUEST_ID, DATA_ID)).toBe(false);
  });

  it('assinatura calculada com secret diferente é rejeitada', () => {
    const ts = String(NOW_MS - 1000);
    const manifest = manifestFor(DATA_ID, REQUEST_ID, ts);
    const v1 = computeV1(manifest, 'outro-secret-completamente-diferente');
    const header = buildHeader(ts, v1);

    expect(verifyMPSignature(header, REQUEST_ID, DATA_ID)).toBe(false);
  });
});

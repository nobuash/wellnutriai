import { createClient } from '@supabase/supabase-js';

/**
 * Cliente com service_role — só pode ser usado no servidor (webhooks,
 * jobs de expiração, exclusão de conta). Ignora RLS. Nunca importar
 * este módulo em código que roda no cliente.
 */
export function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Supabase service role não configurado');
  return createClient(url, key, { auth: { persistSession: false } });
}

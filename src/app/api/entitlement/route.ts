import { getUserEntitlement } from '@/lib/entitlement';
import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

// Fonte da verdade para o frontend saber se o usuário é PRO e o estado
// real da assinatura (provedor, renovação automática, data de expiração).
// Nunca leia isso de profiles.plan no cliente — esse campo é só um cache.
export async function GET() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const entitlement = await getUserEntitlement(supabase, user.id);
  return NextResponse.json(entitlement);
}

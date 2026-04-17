import { createClient } from '@/lib/supabase/server';
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';

export async function POST() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });
  }

  const { data: sub } = await supabase
    .from('subscriptions')
    .select('mp_subscription_id')
    .eq('user_id', user.id)
    .eq('mp_status', 'authorized')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!sub?.mp_subscription_id) {
    return NextResponse.json({ error: 'Nenhum plano ativo encontrado' }, { status: 400 });
  }

  await supabase
    .from('subscriptions')
    .update({ mp_status: 'cancelled' })
    .eq('mp_subscription_id', sub.mp_subscription_id);

  await supabase.from('profiles').update({ plan: 'free' }).eq('id', user.id);

  return NextResponse.json({ ok: true });
}

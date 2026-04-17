'use server';

import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export async function acceptTermsAction() {
  const supabase = createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { error } = await supabase
    .from('profiles')
    .update({
      accepted_terms: true,
      accepted_terms_at: new Date().toISOString(),
    })
    .eq('id', user.id);

  if (error) throw new Error('Erro ao registrar aceite');

  redirect('/dashboard');
}

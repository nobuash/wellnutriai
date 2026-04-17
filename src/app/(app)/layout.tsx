import { AppShell } from '@/components/AppShell';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  if (!user.user_metadata?.accepted_terms) redirect('/accept-terms');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, plan')
    .eq('id', user.id)
    .single();

  // Se o nome está vazio no perfil mas existe nos metadados, atualiza
  const metaName = user.user_metadata?.name as string | undefined;
  if (metaName && !profile?.name) {
    await supabase.from('profiles').update({ name: metaName }).eq('id', user.id);
  }

  const displayName = profile?.name || metaName || null;

  return (
    <AppShell plan={profile?.plan ?? 'free'} name={displayName}>
      <Disclaimer />
      {children}
    </AppShell>
  );
}

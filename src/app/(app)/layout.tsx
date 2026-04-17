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

  return (
    <AppShell plan={profile?.plan ?? 'free'} name={profile?.name ?? null}>
      <Disclaimer />
      {children}
    </AppShell>
  );
}

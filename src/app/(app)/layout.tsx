import { AppShell } from '@/components/AppShell';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { MobileInstallPrompt } from '@/components/MobileInstallPrompt';
import { TERMS_VERSION } from '@/lib/consent';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();

  let user = null;
  try {
    const { data } = await supabase.auth.getUser();
    user = data.user;
  } catch {
    redirect('/login');
  }

  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, plan, accepted_terms, terms_version')
    .eq('id', user.id)
    .single();

  // O gate de aceite precisa ler o banco, não user_metadata do JWT: o
  // usuário pode escrever em user_metadata livremente via
  // supabase.auth.updateUser(), então isso nunca pode ser a fonte da
  // verdade de um controle de acesso. Também exige nova versão dos
  // termos quando TERMS_VERSION sobe.
  if (!profile?.accepted_terms || profile.terms_version !== TERMS_VERSION) {
    redirect('/accept-terms');
  }

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
      <MobileInstallPrompt />
    </AppShell>
  );
}

import { Sidebar } from '@/components/Sidebar';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { createClient } from '@/lib/supabase/server';
import { redirect } from 'next/navigation';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('name, plan, accepted_terms')
    .eq('id', user.id)
    .single();

  if (!profile?.accepted_terms) redirect('/accept-terms');

  return (
    <div className="min-h-screen flex">
      <Sidebar plan={profile.plan} name={profile.name} />
      <main className="flex-1 overflow-auto">
        <div className="mx-auto max-w-5xl p-8 space-y-6">
          <Disclaimer />
          {children}
        </div>
      </main>
    </div>
  );
}

import { Card } from '@/components/ui/Card';
import { HydrationWidget } from '@/components/HydrationWidget';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import { Camera, ClipboardList, Lock, MessageCircle, Sparkles, Utensils } from 'lucide-react';
import Link from 'next/link';
import type { MealPlan, MealPlanContent, NutritionQuestionnaire } from '@/types/database';

// Garante dados sempre frescos (sem cache do Next.js)
export const dynamic = 'force-dynamic';

const goalLabels = {
  gain_muscle: 'Ganho de massa muscular',
  lose_fat: 'Redução de gordura',
  maintain: 'Manutenção do peso',
};


export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: questionnaire }, { data: mealPlan }, { data: profile }, { data: subscription }] = await Promise.all([
    supabase
      .from('nutrition_questionnaires')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<{ data: NutritionQuestionnaire | null }>,
    supabase
      .from('meal_plans')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as unknown as Promise<{ data: MealPlan | null }>,
    supabase.from('profiles').select('name, plan').eq('id', user!.id).single(),
    supabase
      .from('subscriptions')
      .select('expires_at, next_payment_date, payment_type, mp_status')
      .eq('user_id', user!.id)
      .eq('mp_status', 'authorized')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);

  const content = mealPlan?.content as MealPlanContent | undefined;
  const isPro = profile?.plan === 'pro';

  const daysLeft = (() => {
    if (!isPro) return null;
    const expiresAt = subscription?.expires_at;
    if (!expiresAt) return null;
    const diff = new Date(expiresAt).getTime() - Date.now();
    return Math.max(0, Math.ceil(diff / (1000 * 60 * 60 * 24)));
  })();

  const isRecurring = subscription?.payment_type === 'subscription';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Olá, {profile?.name?.split(' ')[0] || 'bem-vindo'}!</h1>
        <p className="text-slate-500">Aqui está um resumo da sua jornada nutricional.</p>
      </div>

      {/* Cards de resumo */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Plano com badge visual */}
        <Card>
          <p className="text-xs text-slate-500 uppercase">Plano</p>
          <div className="flex items-center gap-2 mt-1">
            {isPro ? (
              <Link href="/pricing" className="group flex items-center gap-2">
                <span className="text-2xl font-bold text-brand-600">PRO</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold group-hover:bg-brand-200 transition-colors">
                  <Sparkles className="h-3 w-3" /> Ativo
                </span>
              </Link>
            ) : (
              <>
                <span className="text-2xl font-bold text-slate-700">FREE</span>
                <Link href="/pricing" className="text-xs text-brand-600 font-medium hover:underline">
                  Fazer upgrade →
                </Link>
              </>
            )}
          </div>
          {isPro && (
            <p className="text-xs text-slate-500 mt-1">
              {isRecurring
                ? 'Renovação automática via cartão'
                : daysLeft !== null
                  ? daysLeft > 0
                    ? `${daysLeft} dia${daysLeft !== 1 ? 's' : ''} restante${daysLeft !== 1 ? 's' : ''}`
                    : 'Expira hoje — renove via PIX'
                  : 'Acesso ativo'}
            </p>
          )}
        </Card>

        <Card>
          <p className="text-xs text-slate-500 uppercase">Objetivo</p>
          <p className="text-lg font-semibold mt-1">
            {questionnaire ? goalLabels[questionnaire.goal] : '—'}
          </p>
        </Card>

        <Card>
          <p className="text-xs text-slate-500 uppercase">Último plano</p>
          <p className="text-lg font-semibold mt-1">
            {mealPlan ? formatDate(mealPlan.created_at) : 'Ainda não gerado'}
          </p>
        </Card>
      </div>

      {/* Hidratação diária */}
      <Card>
        <HydrationWidget goalMl={content?.daily_water_ml ?? 2000} />
      </Card>

      {/* Plano alimentar atual */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-xl font-semibold">Seu plano alimentar atual</h2>
          <Link href="/meal-plan" className="text-sm text-brand-600 font-medium hover:underline">
            Ver completo
          </Link>
        </div>

        {!questionnaire ? (
          <EmptyState
            title="Responda o questionário"
            desc="Preencha seus dados para gerar seu primeiro plano sugerido por IA."
            href="/questionnaire"
            cta="Começar questionário"
          />
        ) : !mealPlan ? (
          <EmptyState
            title="Gere seu plano"
            desc="Seu questionário está pronto. Clique para gerar o plano sugerido."
            href="/meal-plan"
            cta="Gerar plano"
          />
        ) : (
          <div className="space-y-2">
            <p className="text-slate-700">{content?.summary}</p>
            <p className="text-sm text-slate-500">
              {content?.total_calories} kcal sugeridas · {content?.meals?.length} refeições
            </p>
          </div>
        )}
      </Card>

      {/* Atalhos */}
      <div className="grid md:grid-cols-4 gap-4">
        <Shortcut href="/questionnaire" icon={ClipboardList} label="Questionário" />
        <Shortcut href="/meal-plan" icon={Utensils} label="Plano alimentar" />
        <Shortcut
          href={isPro ? '/chat' : '/pricing'}
          icon={MessageCircle}
          label="Chat IA"
          locked={!isPro}
        />
        <Shortcut
          href={isPro ? '/photo-analysis' : '/pricing'}
          icon={Camera}
          label="Análise por foto"
          locked={!isPro}
        />
      </div>
    </div>
  );
}

function EmptyState({ title, desc, href, cta }: { title: string; desc: string; href: string; cta: string }) {
  return (
    <div className="text-center py-8">
      <h3 className="font-semibold text-lg mb-1">{title}</h3>
      <p className="text-slate-500 mb-4">{desc}</p>
      <Link
        href={href}
        className="inline-flex h-10 items-center rounded-lg bg-brand-600 text-white px-4 text-sm font-medium hover:bg-brand-700"
      >
        {cta}
      </Link>
    </div>
  );
}

function Shortcut({
  href, icon: Icon, label, locked,
}: {
  href: string;
  icon: React.ElementType;
  label: string;
  locked?: boolean;
}) {
  return (
    <Link
      href={href}
      className="group relative rounded-xl border border-slate-200 bg-white p-4 flex flex-col items-start gap-3 hover:border-brand-400 hover:shadow-sm transition-all"
    >
      <div className="h-9 w-9 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center group-hover:bg-brand-100">
        <Icon className="h-4 w-4" />
      </div>
      <span className="text-sm font-medium text-slate-700">{label}</span>
      {locked && (
        <span className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 text-[10px] font-semibold">
          <Lock className="h-2.5 w-2.5" /> PRO
        </span>
      )}
    </Link>
  );
}

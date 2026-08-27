import { Card } from '@/components/ui/Card';
import { CalorieWidget } from '@/components/CalorieWidget';
import { HydrationWidget } from '@/components/HydrationWidget';
import { StreakBadge } from '@/components/StreakBadge';
import { createClient, getCachedUser } from '@/lib/supabase/server';
import { getEffectiveStreak } from '@/lib/streak';
import { formatDate } from '@/lib/utils';
import { Camera, ClipboardList, Lock, MessageCircle, Sparkles, Utensils } from 'lucide-react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import type { MealPlan, MealPlanContent, NutritionQuestionnaire } from '@/types/database';
import { privateMetadata } from '@/lib/seo';

// Garante dados sempre frescos (sem cache do Next.js)
export const dynamic = 'force-dynamic';

export const metadata = privateMetadata('Painel — WellNutriAI');

const goalLabels = {
  gain_muscle: 'Ganho de massa muscular',
  lose_fat: 'Redução de gordura',
  maintain: 'Manutenção do peso',
};


export default async function DashboardPage() {
  const supabase = createClient();
  // getCachedUser() é memoizada por requisição (react cache()) — como
  // (app)/layout.tsx já chamou a mesma função pra esta requisição, isso
  // reaproveita o resultado em vez de fazer uma segunda chamada de rede
  // pra API de Auth do Supabase (CONFIRMADO: cada página estava
  // chamando getUser() de novo por conta própria, dobrando o tráfego
  // de auth e ajudando a estourar o rate limit do projeto).
  const user = await getCachedUser();

  // (app)/layout.tsx já faz esse mesmo redirect antes de renderizar
  // esta página — mas se a checagem de auth aqui falhar por qualquer
  // motivo (ex: rate limit da API do Supabase), `user` pode vir null
  // mesmo assim. Sem essa guarda, os `user!.id` abaixo quebravam a
  // página com TypeError em vez de simplesmente redirecionar de novo.
  if (!user) redirect('/login');

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
    supabase
      .from('profiles')
      .select('name, plan, current_streak_days, last_meal_logged_date')
      .eq('id', user!.id)
      .single(),
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

  const streak = getEffectiveStreak({
    lastMealLoggedDate: profile?.last_meal_logged_date ?? null,
    currentStreakDays: profile?.current_streak_days ?? 0,
  });

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl text-ink">Olá, {profile?.name?.split(' ')[0] || 'bem-vindo'}!</h1>
          <p className="text-ink-muted mt-1">Aqui está um resumo da sua jornada nutricional.</p>
        </div>
        <StreakBadge days={streak.days} loggedToday={streak.loggedToday} />
      </div>

      {/* Cards de resumo */}
      <div className="grid md:grid-cols-3 gap-4">
        {/* Plano com badge visual */}
        <Card>
          <p className="text-xs text-ink-muted uppercase tracking-wide">Plano</p>
          <div className="flex items-center gap-2 mt-1.5">
            {isPro ? (
              <Link href="/pricing" className="group flex items-center gap-2">
                <span className="font-display text-2xl text-primary-600">PRO</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary-100 text-primary-700 text-xs font-semibold group-hover:bg-primary-200 transition-colors duration-200">
                  <Sparkles className="h-3 w-3" /> Ativo
                </span>
              </Link>
            ) : (
              <>
                <span className="font-display text-2xl text-ink-secondary">FREE</span>
                <Link href="/pricing" className="text-xs text-primary-600 font-medium hover:underline">
                  Fazer upgrade →
                </Link>
              </>
            )}
          </div>
          {isPro && (
            <p className="text-xs text-ink-muted mt-1.5">
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
          <p className="text-xs text-ink-muted uppercase tracking-wide">Objetivo</p>
          <p className="text-lg font-semibold text-ink mt-1.5">
            {questionnaire ? goalLabels[questionnaire.goal] : '—'}
          </p>
        </Card>

        <Card>
          <p className="text-xs text-ink-muted uppercase tracking-wide">Último plano</p>
          <p className="text-lg font-semibold text-ink mt-1.5">
            {mealPlan ? formatDate(mealPlan.created_at) : 'Ainda não gerado'}
          </p>
        </Card>
      </div>

      {/* Plano alimentar atual */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl text-ink">Seu plano alimentar atual</h2>
          <Link href="/meal-plan" className="text-sm text-primary-600 font-medium hover:underline">
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
            <p className="text-ink-secondary">{content?.summary}</p>
            <p className="text-sm text-ink-muted">
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

      {/* Contador de calorias diário */}
      <Card>
        <CalorieWidget goalKcal={content?.total_calories ?? null} />
      </Card>

      {/* Hidratação diária */}
      <Card>
        <HydrationWidget goalMl={content?.daily_water_ml ?? 2000} />
      </Card>
    </div>
  );
}

function EmptyState({ title, desc, href, cta }: { title: string; desc: string; href: string; cta: string }) {
  return (
    <div className="text-center py-8">
      <h3 className="font-semibold text-ink text-lg mb-1.5">{title}</h3>
      <p className="text-ink-muted mb-5">{desc}</p>
      <Link
        href={href}
        className="inline-flex h-10 items-center rounded-md bg-primary-500 text-white px-4 text-sm font-medium hover:bg-primary-600 transition-colors duration-200"
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
      className="group relative rounded-md border border-border bg-surface p-4 flex flex-col items-start gap-3 hover:border-primary-300 transition-colors duration-200"
    >
      <div className="h-9 w-9 rounded-sm bg-primary-50 text-primary-600 flex items-center justify-center group-hover:bg-primary-100 transition-colors duration-200">
        <Icon className="h-4 w-4" strokeWidth={1.75} />
      </div>
      <span className="text-sm font-medium text-ink-secondary">{label}</span>
      {locked && (
        <span className="absolute top-2 right-2 flex items-center gap-1 px-1.5 py-0.5 rounded-sm bg-warning/15 text-warning text-[10px] font-semibold">
          <Lock className="h-2.5 w-2.5" /> PRO
        </span>
      )}
    </Link>
  );
}

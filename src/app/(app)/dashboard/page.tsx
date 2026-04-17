import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/server';
import { formatDate } from '@/lib/utils';
import { Camera, ClipboardList, Droplets, Lock, MessageCircle, Sparkles, Utensils } from 'lucide-react';
import Link from 'next/link';
import type { MealPlan, MealPlanContent, NutritionQuestionnaire } from '@/types/database';

// Garante dados sempre frescos (sem cache do Next.js)
export const dynamic = 'force-dynamic';

const goalLabels = {
  gain_muscle: 'Ganho de massa muscular',
  lose_fat: 'Redução de gordura',
  maintain: 'Manutenção do peso',
};

function calcWaterLiters(age: number, weightKg: number): number {
  let mlPerKg: number;
  if (age <= 17) mlPerKg = 40;
  else if (age <= 55) mlPerKg = 35;
  else if (age <= 65) mlPerKg = 30;
  else mlPerKg = 25;
  return Math.round((mlPerKg * weightKg) / 100) / 10; // arredonda p/ 1 casa decimal
}

export default async function DashboardPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  const [{ data: questionnaire }, { data: mealPlan }, { data: profile }] = await Promise.all([
    supabase
      .from('nutrition_questionnaires')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as Promise<{ data: NutritionQuestionnaire | null }>,
    supabase
      .from('meal_plans')
      .select('*')
      .eq('user_id', user!.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle() as Promise<{ data: MealPlan | null }>,
    supabase.from('profiles').select('name, plan').eq('id', user!.id).single(),
  ]);

  const content = mealPlan?.content as MealPlanContent | undefined;
  const isPro = profile?.plan === 'pro';
  const waterLiters = questionnaire
    ? calcWaterLiters(questionnaire.age, questionnaire.weight)
    : null;

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
              <>
                <span className="text-2xl font-bold text-brand-600">PRO</span>
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-brand-100 text-brand-700 text-xs font-semibold">
                  <Sparkles className="h-3 w-3" /> Ativo
                </span>
              </>
            ) : (
              <>
                <span className="text-2xl font-bold text-slate-700">FREE</span>
                <Link
                  href="/pricing"
                  className="text-xs text-brand-600 font-medium hover:underline"
                >
                  Fazer upgrade →
                </Link>
              </>
            )}
          </div>
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
      {waterLiters && (
        <Card className="bg-blue-50 border-blue-200">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-lg bg-blue-100 text-blue-600 flex items-center justify-center shrink-0">
              <Droplets className="h-5 w-5" />
            </div>
            <div>
              <p className="text-xs text-blue-600 font-medium uppercase">Hidratação mínima recomendada</p>
              <p className="text-2xl font-bold text-blue-700">
                {waterLiters} L
                <span className="text-sm font-normal text-blue-500 ml-2">de água por dia</span>
              </p>
              <p className="text-xs text-blue-500 mt-0.5">
                Baseado no seu peso ({questionnaire?.weight} kg) e idade ({questionnaire?.age} anos)
              </p>
            </div>
          </div>
        </Card>
      )}

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

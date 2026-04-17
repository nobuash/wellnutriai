'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';
import type { MealPlan, MealPlanContent } from '@/types/database';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';

export default function MealPlanPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  const { data: mealPlan, isLoading } = useQuery({
    queryKey: ['meal-plan-latest'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase
        .from('meal_plans')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      return data as MealPlan | null;
    },
  });

  const generate = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/meal-plan', { method: 'POST' });
      const data = await res.json();
      if (!res.ok) {
        if (data.upgrade) {
          toast.error(data.error, {
            action: { label: 'Upgrade', onClick: () => router.push('/pricing') },
          });
        } else {
          toast.error(data.error || 'Erro ao gerar');
        }
        throw new Error(data.error);
      }
      return data.mealPlan as MealPlan;
    },
    onSuccess: () => {
      toast.success('Plano gerado!');
      queryClient.invalidateQueries({ queryKey: ['meal-plan-latest'] });
    },
  });

  const content = mealPlan?.content as MealPlanContent | undefined;

  if (isLoading) return <Card>Carregando...</Card>;

  if (!mealPlan) {
    return (
      <Card className="text-center py-12">
        <Sparkles className="h-10 w-10 text-brand-600 mx-auto mb-4" />
        <h2 className="text-xl font-semibold mb-2">Gere seu primeiro plano</h2>
        <p className="text-slate-500 mb-6 max-w-md mx-auto">
          Com base nas informações do questionário, a IA vai sugerir um plano alimentar personalizado.
        </p>
        <div className="flex gap-2 justify-center">
          <Link href="/questionnaire">
            <Button variant="outline">Revisar questionário</Button>
          </Link>
          <Button loading={generate.isPending} onClick={() => generate.mutate()}>
            Gerar plano sugerido
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Plano alimentar sugerido</h1>
          <p className="text-sm text-slate-500">
            Gerado em {formatDate(mealPlan.created_at)} · Sugestão de IA
          </p>
        </div>
        <Button loading={generate.isPending} onClick={() => generate.mutate()}>
          <Sparkles className="h-4 w-4" />
          Gerar novo
        </Button>
      </div>

      <Card>
        <p className="text-slate-700 mb-4">{content?.summary}</p>
        <div className="grid grid-cols-4 gap-3">
          <Stat label="Calorias" value={`${content?.total_calories ?? '—'} kcal`} />
          <Stat label="Proteína" value={`${content?.macros?.protein_g ?? '—'}g`} />
          <Stat label="Carboidratos" value={`${content?.macros?.carbs_g ?? '—'}g`} />
          <Stat label="Gorduras" value={`${content?.macros?.fat_g ?? '—'}g`} />
        </div>
      </Card>

      <div className="space-y-3">
        {content?.meals?.map((meal, i) => (
          <Card key={i}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">{meal.name}</h3>
              <span className="text-sm text-slate-500">{meal.time}</span>
            </div>
            <ul className="space-y-1 mb-3">
              {meal.foods.map((f, j) => (
                <li key={j} className="flex justify-between text-sm">
                  <span className="text-slate-700">{f.item}</span>
                  <span className="text-slate-500">{f.quantity}</span>
                </li>
              ))}
            </ul>
            <div className="flex gap-4 text-xs text-slate-500 pt-3 border-t border-slate-100">
              <span>{meal.calories} kcal</span>
              <span>P: {meal.macros.protein_g}g</span>
              <span>C: {meal.macros.carbs_g}g</span>
              <span>G: {meal.macros.fat_g}g</span>
            </div>
          </Card>
        ))}
      </div>

      {content?.observations && content.observations.length > 0 && (
        <Card>
          <h3 className="font-semibold mb-3">Observações</h3>
          <ul className="space-y-2 text-sm text-slate-700 list-disc pl-5">
            {content.observations.map((obs, i) => (
              <li key={i}>{obs}</li>
            ))}
          </ul>
        </Card>
      )}

      <Disclaimer variant="warning">
        {content?.disclaimer ||
          'Este é um plano alimentar sugerido por IA. Não substitui nutricionista ou profissional de saúde.'}
      </Disclaimer>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg bg-slate-50 p-3">
      <p className="text-xs text-slate-500 uppercase">{label}</p>
      <p className="font-semibold mt-1">{value}</p>
    </div>
  );
}

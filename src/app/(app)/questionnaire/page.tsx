'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { questionnaireSchema, type QuestionnaireInput } from '@/lib/validation';
import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'next/navigation';
import { Controller, useForm } from 'react-hook-form';
import { toast } from 'sonner';

const GOALS = [
  { value: 'lose_fat', label: 'Perder gordura' },
  { value: 'gain_muscle', label: 'Ganhar massa' },
  { value: 'maintain', label: 'Manter' },
] as const;

const ACTIVITY = [
  { value: 'sedentary', label: 'Sedentário' },
  { value: 'light', label: 'Leve' },
  { value: 'moderate', label: 'Moderado' },
  { value: 'intense', label: 'Intenso' },
  { value: 'athlete', label: 'Atleta' },
] as const;

const DIABETES_OPTIONS = [
  { value: 'none', label: 'Não sou diabético', description: null },
  { value: 'pre_diabetes', label: 'Pré-diabetes', description: 'Glicemia levemente elevada' },
  { value: 'type2', label: 'Diabetes tipo 2', description: 'Resistência à insulina' },
  { value: 'type1', label: 'Diabetes tipo 1', description: 'Dependente de insulina' },
] as const;

const MEDICAL_CHECKBOXES = [
  { name: 'is_pregnant', label: 'Estou grávida' },
  { name: 'is_breastfeeding', label: 'Estou amamentando' },
  { name: 'has_kidney_disease', label: 'Tenho doença renal' },
  { name: 'has_liver_disease', label: 'Tenho doença hepática' },
  { name: 'has_eating_disorder_history', label: 'Tenho ou já tive transtorno alimentar' },
  { name: 'has_severe_allergy', label: 'Tenho alergia alimentar severa (risco de anafilaxia)' },
  { name: 'uses_insulin', label: 'Uso insulina' },
] as const;

function TagsInput({ value, onChange, placeholder }: {
  value: string[]; onChange: (v: string[]) => void; placeholder?: string;
}) {
  return (
    <div>
      <div className="flex flex-wrap gap-2 mb-2">
        {value.map((tag) => (
          <span key={tag} className="inline-flex items-center gap-1 rounded-full bg-brand-50 text-brand-700 px-3 py-1 text-xs">
            {tag}
            <button
              type="button"
              onClick={() => onChange(value.filter((t) => t !== tag))}
              className="hover:text-brand-900"
              aria-label="remover"
            >×</button>
          </span>
        ))}
      </div>
      <input
        type="text"
        placeholder={placeholder}
        className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
        onKeyDown={(e) => {
          if (e.key === 'Enter' && e.currentTarget.value.trim()) {
            e.preventDefault();
            const v = e.currentTarget.value.trim();
            if (!value.includes(v)) onChange([...value, v]);
            e.currentTarget.value = '';
          }
        }}
      />
      <p className="text-xs text-slate-500 mt-1">Digite e pressione Enter</p>
    </div>
  );
}

export default function QuestionnairePage() {
  const router = useRouter();

  const {
    register, handleSubmit, control, formState: { errors, isSubmitting },
  } = useForm<QuestionnaireInput>({
    resolver: zodResolver(questionnaireSchema),
    defaultValues: {
      allergies: [], dietary_preferences: [], disliked_foods: [], meals_per_day: 4, diabetes_type: 'none',
      is_pregnant: false, is_breastfeeding: false, has_kidney_disease: false, has_liver_disease: false,
      has_eating_disorder_history: false, has_severe_allergy: false, uses_insulin: false,
    },
  });

  async function onSubmit(data: QuestionnaireInput) {
    const res = await fetch('/api/questionnaire', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });
    const result = await res.json().catch(() => ({}));

    if (!res.ok) {
      toast.error(result.error || 'Erro ao salvar questionário');
      return;
    }

    toast.success('Questionário salvo!');
    router.push('/meal-plan');
    router.refresh();
  }

  return (
    <Card className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-1">Questionário nutricional</h1>
      <p className="text-sm text-slate-500 mb-6">
        Seus dados ficam privados e são usados apenas para gerar seu plano sugerido por IA.
      </p>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
        <div className="grid md:grid-cols-3 gap-4">
          <Input label="Idade" type="number" {...register('age')} error={errors.age?.message} />
          <Input label="Peso (kg)" type="number" step="0.1" {...register('weight')} error={errors.weight?.message} />
          <Input label="Altura (cm)" type="number" step="0.1" {...register('height')} error={errors.height?.message} />
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <Input label="Gordura corporal (%) — opcional" type="number" step="0.1" {...register('body_fat')} />
          <Input label="Refeições por dia" type="number" {...register('meals_per_day')} error={errors.meals_per_day?.message} />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Objetivo</label>
          <div className="grid grid-cols-3 gap-2">
            {GOALS.map((g) => (
              <label key={g.value} className="cursor-pointer">
                <input type="radio" value={g.value} {...register('goal')} className="peer sr-only" />
                <div className="rounded-lg border border-slate-300 p-3 text-center text-sm peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-checked:font-medium">
                  {g.label}
                </div>
              </label>
            ))}
          </div>
          {errors.goal && <p className="text-xs text-red-600 mt-1">Selecione um objetivo</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Nível de atividade</label>
          <div className="grid grid-cols-5 gap-2">
            {ACTIVITY.map((a) => (
              <label key={a.value} className="cursor-pointer">
                <input type="radio" value={a.value} {...register('activity_level')} className="peer sr-only" />
                <div className="rounded-lg border border-slate-300 p-2 text-center text-xs peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-checked:font-medium">
                  {a.label}
                </div>
              </label>
            ))}
          </div>
          {errors.activity_level && <p className="text-xs text-red-600 mt-1">Selecione um nível</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Você tem diabetes?</label>
          <div className="grid grid-cols-2 gap-2">
            {DIABETES_OPTIONS.map((d) => (
              <label key={d.value} className="cursor-pointer">
                <input type="radio" value={d.value} {...register('diabetes_type')} className="peer sr-only" />
                <div className="rounded-lg border border-slate-300 p-3 text-sm peer-checked:border-brand-600 peer-checked:bg-brand-50 peer-checked:text-brand-700 peer-checked:font-medium">
                  <span className="font-medium">{d.label}</span>
                  {d.description && <p className="text-xs text-slate-400 mt-0.5">{d.description}</p>}
                </div>
              </label>
            ))}
          </div>
          {errors.diabetes_type && <p className="text-xs text-red-600 mt-1">Selecione uma opção</p>}
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Alguma dessas condições se aplica a você?
          </label>
          <p className="text-xs text-slate-500 mb-2">
            Isso nos ajuda a saber quando não é seguro gerar um plano automatizado — nesses casos,
            recomendamos acompanhamento profissional em vez de uma sugestão genérica de IA.
          </p>
          <div className="grid md:grid-cols-2 gap-2">
            {MEDICAL_CHECKBOXES.map((c) => (
              <label key={c.name} className="flex items-center gap-2 rounded-lg border border-slate-200 p-3 text-sm cursor-pointer hover:bg-slate-50">
                <input type="checkbox" {...register(c.name)} className="h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500" />
                {c.label}
              </label>
            ))}
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">
            Outra condição médica relevante (opcional)
          </label>
          <input
            type="text"
            {...register('other_medical_condition')}
            placeholder="ex: hipotireoidismo, pós-cirurgia bariátrica..."
            className="w-full h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Alergias</label>
          <Controller
            name="allergies"
            control={control}
            render={({ field }) => (
              <TagsInput value={field.value} onChange={field.onChange} placeholder="ex: lactose" />
            )}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Preferências alimentares</label>
          <Controller
            name="dietary_preferences"
            control={control}
            render={({ field }) => (
              <TagsInput value={field.value} onChange={field.onChange} placeholder="ex: vegetariano" />
            )}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Alimentos que você não gosta</label>
          <Controller
            name="disliked_foods"
            control={control}
            render={({ field }) => (
              <TagsInput value={field.value} onChange={field.onChange} placeholder="ex: brócolis" />
            )}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-slate-700 mb-2">Rotina (opcional)</label>
          <textarea
            {...register('routine')}
            rows={3}
            placeholder="Conte um pouco sobre sua rotina diária e horários"
            className="w-full px-3 py-2 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
          />
        </div>

        <Button type="submit" className="w-full" loading={isSubmitting}>
          Salvar e gerar plano
        </Button>
      </form>
    </Card>
  );
}

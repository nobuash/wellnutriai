'use client';

import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Flame, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface CalorieLog {
  id: string;
  calories: number;
  description: string | null;
  logged_at: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function CalorieWidget({ goalKcal }: { goalKcal: number | null }) {
  const supabase = createClient();
  const queryClient = useQueryClient();

  const today = new Date().toISOString().split('T')[0];

  const { data: logs = [] } = useQuery<CalorieLog[]>({
    queryKey: ['calorie-logs', today],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from('calorie_logs')
        .select('id, calories, description, logged_at')
        .eq('user_id', user.id)
        .gte('logged_at', `${today}T00:00:00`)
        .lte('logged_at', `${today}T23:59:59`)
        .order('logged_at', { ascending: false });
      return data ?? [];
    },
  });

  const totalKcal = logs.reduce((sum, l) => sum + l.calories, 0);
  const percent = goalKcal ? Math.round((totalKcal / goalKcal) * 100) : null;
  const exceeded = percent !== null && percent > 100;

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('calorie_logs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['calorie-logs', today] }),
    onError: () => toast.error('Erro ao remover registro'),
  });

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');
      const { error } = await supabase
        .from('calorie_logs')
        .delete()
        .eq('user_id', user.id)
        .gte('logged_at', `${today}T00:00:00`)
        .lte('logged_at', `${today}T23:59:59`);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['calorie-logs', today] });
      toast.success('Contador zerado');
    },
    onError: () => toast.error('Erro ao zerar contador'),
  });

  return (
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Flame className="h-5 w-5 text-red-500" />
          <span className="font-semibold text-slate-700">Calorias de hoje</span>
        </div>
        <div className="flex items-center gap-3">
          {goalKcal && (
            <span className="text-sm text-slate-400">Meta: {goalKcal} kcal</span>
          )}
          {logs.length > 0 && (
            <button
              onClick={() => resetMutation.mutate()}
              disabled={resetMutation.isPending}
              className="text-xs text-red-400 hover:text-red-600 transition-colors disabled:opacity-50"
            >
              Zerar
            </button>
          )}
        </div>
      </div>

      {/* Total + barra */}
      <div>
        <div className="flex items-end justify-between mb-1.5">
          <span className={`text-3xl font-bold ${exceeded ? 'text-red-600' : 'text-red-500'}`}>
            {totalKcal} kcal
          </span>
          {percent !== null && (
            <span className={`text-sm mb-1 ${exceeded ? 'text-red-500 font-semibold' : 'text-slate-400'}`}>
              {percent}%{exceeded ? ' — meta ultrapassada' : ''}
            </span>
          )}
        </div>

        {goalKcal && (
          <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
            <div
              className={`h-3 rounded-full transition-all duration-500 ${
                exceeded
                  ? 'bg-gradient-to-r from-red-500 to-red-700'
                  : 'bg-gradient-to-r from-red-300 to-red-500'
              }`}
              style={{ width: `${Math.min(100, percent ?? 0)}%` }}
            />
          </div>
        )}

        {!goalKcal && (
          <p className="text-xs text-slate-400">
            Gere um plano alimentar para definir sua meta calórica diária.
          </p>
        )}
      </div>

      {/* Refeições do dia */}
      {logs.length > 0 ? (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {logs.map((log) => (
            <div
              key={log.id}
              className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-slate-50"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Flame className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <div className="min-w-0">
                  <span className="font-medium text-red-700">{log.calories} kcal</span>
                  {log.description && (
                    <span className="text-xs text-slate-400 ml-1.5 truncate block">
                      {log.description}
                    </span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="text-xs text-slate-400">{formatTime(log.logged_at)}</span>
                <button
                  onClick={() => deleteMutation.mutate(log.id)}
                  className="text-slate-300 hover:text-red-400 transition-colors"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-sm text-slate-400 text-center py-2">
          Nenhuma refeição registrada hoje. Analise uma refeição para começar.
        </p>
      )}
    </div>
  );
}

// Função utilitária exportada para a página de análise usar
export async function addCalorieLog(
  supabase: ReturnType<typeof createClient>,
  calories: number,
  description: string,
): Promise<void> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Não autenticado');
  const { error } = await supabase
    .from('calorie_logs')
    .insert({ user_id: user.id, calories, description });
  if (error) throw error;
}

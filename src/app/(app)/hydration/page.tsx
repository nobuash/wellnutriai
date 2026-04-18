'use client';

import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { createClient } from '@/lib/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Droplets, Trash2, Plus } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

const DEFAULT_GOAL_ML = 2000;

interface WaterLog {
  id: string;
  amount_ml: number;
  logged_at: string;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

function formatMl(ml: number) {
  return ml >= 1000 ? `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1)}L` : `${ml}ml`;
}

export default function HydrationPage() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);

  // Meta do plano alimentar
  const { data: goalMl = DEFAULT_GOAL_ML } = useQuery({
    queryKey: ['water-goal'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return DEFAULT_GOAL_ML;
      const { data } = await supabase
        .from('meal_plans')
        .select('content')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      return (data?.content as any)?.daily_water_ml ?? DEFAULT_GOAL_ML;
    },
  });

  // Logs de hoje
  const today = new Date().toISOString().split('T')[0];
  const { data: logs = [] } = useQuery<WaterLog[]>({
    queryKey: ['water-logs', today],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from('water_logs')
        .select('id, amount_ml, logged_at')
        .eq('user_id', user.id)
        .gte('logged_at', `${today}T00:00:00`)
        .lte('logged_at', `${today}T23:59:59`)
        .order('logged_at', { ascending: false });
      return data ?? [];
    },
  });

  const totalMl = logs.reduce((sum, l) => sum + l.amount_ml, 0);
  const percent = Math.min(100, Math.round((totalMl / goalMl) * 100));

  const addMutation = useMutation({
    mutationFn: async (amount_ml: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');
      const { error } = await supabase.from('water_logs').insert({ user_id: user.id, amount_ml });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['water-logs', today] });
    },
    onError: () => toast.error('Erro ao registrar água'),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from('water_logs').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['water-logs', today] }),
    onError: () => toast.error('Erro ao remover registro'),
  });

  function handleAdd(ml: number) {
    if (ml <= 0) return;
    addMutation.mutate(ml);
    if (totalMl < goalMl && totalMl + ml >= goalMl) {
      setTimeout(() => toast.success('Meta de água atingida! 🎉'), 300);
    }
  }

  function handleCustomAdd() {
    const ml = parseInt(customInput);
    if (!ml || ml <= 0 || ml > 5000) {
      toast.error('Digite um valor entre 1 e 5000 ml');
      return;
    }
    handleAdd(ml);
    setCustomInput('');
    setShowCustom(false);
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Hidratação</h1>
        <p className="text-sm text-slate-500">Acompanhe sua ingestão de água diária.</p>
      </div>

      {/* Card principal */}
      <Card>
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Droplets className="h-5 w-5 text-blue-500" />
            <span className="font-semibold text-slate-700">Hoje</span>
          </div>
          <span className="text-sm text-slate-500">Meta: {formatMl(goalMl)}</span>
        </div>

        {/* Valor total */}
        <div className="text-center mb-4">
          <p className="text-5xl font-bold text-blue-600">{formatMl(totalMl)}</p>
          <p className="text-sm text-slate-400 mt-1">{percent}% da meta atingida</p>
        </div>

        {/* Barra de progresso */}
        <div className="w-full bg-slate-100 rounded-full h-4 mb-6 overflow-hidden">
          <div
            className="h-4 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500"
            style={{ width: `${percent}%` }}
          />
        </div>

        {/* Botões de adição */}
        <div className="grid grid-cols-4 gap-2">
          {[200, 500, 1000].map((ml) => (
            <button
              key={ml}
              onClick={() => handleAdd(ml)}
              disabled={addMutation.isPending}
              className="flex flex-col items-center gap-1 p-3 rounded-xl border border-blue-100 bg-blue-50 hover:bg-blue-100 active:scale-95 transition-all disabled:opacity-50"
            >
              <Droplets className="h-5 w-5 text-blue-500" />
              <span className="text-xs font-semibold text-blue-700">+{formatMl(ml)}</span>
            </button>
          ))}
          <button
            onClick={() => setShowCustom((v) => !v)}
            className="flex flex-col items-center gap-1 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 transition-all"
          >
            <Plus className="h-5 w-5 text-slate-500" />
            <span className="text-xs font-semibold text-slate-600">Outro</span>
          </button>
        </div>

        {/* Input customizado */}
        {showCustom && (
          <div className="flex gap-2 mt-3">
            <input
              type="number"
              min={1}
              max={5000}
              placeholder="Ex: 300"
              value={customInput}
              onChange={(e) => setCustomInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCustomAdd()}
              className="flex-1 border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <span className="self-center text-sm text-slate-500">ml</span>
            <Button size="sm" onClick={handleCustomAdd} loading={addMutation.isPending}>
              Adicionar
            </Button>
          </div>
        )}
      </Card>

      {/* Registros do dia */}
      <div>
        <h2 className="text-sm font-semibold text-slate-500 mb-3 uppercase tracking-wide">Registros de hoje</h2>
        {logs.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-6">Nenhum registro ainda. Beba água! 💧</p>
        ) : (
          <div className="space-y-2">
            {logs.map((log) => (
              <div
                key={log.id}
                className="flex items-center justify-between bg-white border border-slate-100 rounded-xl px-4 py-3 shadow-sm"
              >
                <div className="flex items-center gap-3">
                  <Droplets className="h-4 w-4 text-blue-400" />
                  <span className="font-semibold text-blue-700">{formatMl(log.amount_ml)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-400">{formatTime(log.logged_at)}</span>
                  <button
                    onClick={() => deleteMutation.mutate(log.id)}
                    className="text-slate-300 hover:text-red-400 transition-colors"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info da meta */}
      {goalMl === DEFAULT_GOAL_ML && (
        <p className="text-xs text-slate-400 text-center">
          Meta baseada no padrão de 2L/dia. Gere um plano alimentar para receber uma meta personalizada.
        </p>
      )}
    </div>
  );
}

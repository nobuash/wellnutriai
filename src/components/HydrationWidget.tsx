'use client';

import { createClient } from '@/lib/supabase/client';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Droplets, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/Button';

interface WaterLog {
  id: string;
  amount_ml: number;
  logged_at: string;
}

function formatMl(ml: number) {
  return ml >= 1000 ? `${(ml / 1000).toFixed(ml % 1000 === 0 ? 0 : 1)}L` : `${ml}ml`;
}

function formatTime(iso: string) {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
}

export function HydrationWidget({ goalMl }: { goalMl: number }) {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [customInput, setCustomInput] = useState('');
  const [showCustom, setShowCustom] = useState(false);

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
  const percent = Math.round((totalMl / goalMl) * 100);

  const addMutation = useMutation({
    mutationFn: async (amount_ml: number) => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');
      const { error } = await supabase.from('water_logs').insert({ user_id: user.id, amount_ml });
      if (error) throw error;
    },
    onSuccess: (_, amount_ml) => {
      queryClient.invalidateQueries({ queryKey: ['water-logs', today] });
      if (totalMl < goalMl && totalMl + amount_ml >= goalMl) {
        setTimeout(() => toast.success('Meta de água atingida!'), 300);
      }
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

  const resetMutation = useMutation({
    mutationFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error('Não autenticado');
      const { error } = await supabase
        .from('water_logs')
        .delete()
        .eq('user_id', user.id)
        .gte('logged_at', `${today}T00:00:00`)
        .lte('logged_at', `${today}T23:59:59`);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['water-logs', today] });
      toast.success('Contagem zerada');
    },
    onError: () => toast.error('Erro ao zerar contagem'),
  });

  function handleAdd(ml: number) {
    if (ml <= 0) return;
    addMutation.mutate(ml);
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
    <div className="space-y-4">
      {/* Cabeçalho */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplets className="h-5 w-5 text-blue-500" />
          <span className="font-semibold text-slate-700">Hidratação de hoje</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-sm text-slate-400">Meta: {formatMl(goalMl)}</span>
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
          <span className="text-3xl font-bold text-blue-600">{formatMl(totalMl)}</span>
          <span className="text-sm text-slate-400 mb-1">{percent}%</span>
        </div>
        <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
          <div
            className="h-3 rounded-full bg-gradient-to-r from-blue-400 to-blue-600 transition-all duration-500"
            style={{ width: `${Math.min(100, percent)}%` }}
          />
        </div>
      </div>

      {/* Botões */}
      <div className="grid grid-cols-4 gap-2">
        {[200, 500, 1000].map((ml) => (
          <button
            key={ml}
            onClick={() => handleAdd(ml)}
            disabled={addMutation.isPending}
            className="flex flex-col items-center gap-1 p-3 rounded-xl border border-blue-100 bg-blue-50 hover:bg-blue-100 active:scale-95 transition-all disabled:opacity-50"
          >
            <Droplets className="h-4 w-4 text-blue-500" />
            <span className="text-xs font-semibold text-blue-700">+{formatMl(ml)}</span>
          </button>
        ))}
        <button
          onClick={() => setShowCustom((v) => !v)}
          className="flex flex-col items-center gap-1 p-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 active:scale-95 transition-all"
        >
          <Plus className="h-4 w-4 text-slate-500" />
          <span className="text-xs font-semibold text-slate-600">Outro</span>
        </button>
      </div>

      {/* Input customizado */}
      {showCustom && (
        <div className="flex gap-2">
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
          <span className="self-center text-sm text-slate-400">ml</span>
          <Button size="sm" onClick={handleCustomAdd} loading={addMutation.isPending}>
            Adicionar
          </Button>
        </div>
      )}

      {/* Registros do dia */}
      {logs.length > 0 && (
        <div className="space-y-1.5 max-h-40 overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="flex items-center justify-between text-sm py-1.5 px-2 rounded-lg hover:bg-slate-50">
              <div className="flex items-center gap-2">
                <Droplets className="h-3.5 w-3.5 text-blue-400" />
                <span className="font-medium text-blue-700">{formatMl(log.amount_ml)}</span>
              </div>
              <div className="flex items-center gap-2">
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
      )}
    </div>
  );
}

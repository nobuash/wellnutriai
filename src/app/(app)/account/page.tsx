'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { useQuery, useMutation } from '@tanstack/react-query';
import { AlertTriangle, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

export default function AccountPage() {
  const supabase = createClient();
  const [confirming, setConfirming] = useState(false);
  const [password, setPassword] = useState('');

  const { data: profile } = useQuery({
    queryKey: ['profile-account'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from('profiles').select('name, email, plan').eq('id', user.id).single();
      return data;
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/account/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao excluir conta');
      return data;
    },
    onSuccess: async () => {
      toast.success('Conta excluída. Sentiremos sua falta!');
      await supabase.auth.signOut();
      window.location.href = '/';
    },
    onError: (err: Error) => toast.error(err.message),
  });

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold">Minha conta</h1>
        <p className="text-sm text-slate-500">Dados da sua conta e opções de privacidade.</p>
      </div>

      <Card>
        <h3 className="font-semibold mb-3">Dados</h3>
        <div className="space-y-2 text-sm">
          <p><span className="text-slate-500">Nome:</span> {profile?.name || '—'}</p>
          <p><span className="text-slate-500">E-mail:</span> {profile?.email}</p>
          <p><span className="text-slate-500">Plano:</span> {profile?.plan === 'pro' ? 'PRO' : 'Free'}</p>
        </div>
      </Card>

      <Card className="border-red-200">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-red-700 mb-1">Excluir conta</h3>
            <p className="text-sm text-slate-600 mb-4">
              Isso apaga permanentemente seus questionários, planos alimentares, histórico de chat,
              análises de refeição, registros de água/calorias e fotos enviadas. Se você tiver uma
              assinatura com renovação automática, ela será cancelada. Essa ação não pode ser desfeita.
            </p>

            {!confirming ? (
              <Button variant="outline" className="border-red-300 text-red-700 hover:bg-red-50" onClick={() => setConfirming(true)}>
                <Trash2 className="h-4 w-4" /> Excluir minha conta
              </Button>
            ) : (
              <div className="space-y-3 rounded-lg border border-red-200 bg-red-50 p-4">
                <p className="text-sm text-red-700 font-medium">
                  Digite sua senha para confirmar. Essa ação é definitiva.
                </p>
                <Input
                  type="password"
                  placeholder="Sua senha atual"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete="current-password"
                />
                <div className="flex gap-2">
                  <Button
                    className="flex-1 bg-red-600 hover:bg-red-700"
                    loading={deleteMutation.isPending}
                    disabled={!password}
                    onClick={() => deleteMutation.mutate()}
                  >
                    Confirmar exclusão definitiva
                  </Button>
                  <Button variant="ghost" className="flex-1" onClick={() => { setConfirming(false); setPassword(''); }}>
                    Cancelar
                  </Button>
                </div>
              </div>
            )}
          </div>
        </div>
      </Card>
    </div>
  );
}

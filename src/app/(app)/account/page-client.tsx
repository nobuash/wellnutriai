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
        <h1 className="font-display text-2xl text-ink">Minha conta</h1>
        <p className="text-sm text-ink-muted mt-1">Dados da sua conta e opções de privacidade.</p>
      </div>

      <Card>
        <h3 className="font-semibold text-ink mb-3">Dados</h3>
        <div className="space-y-2 text-sm">
          <p><span className="text-ink-muted">Nome:</span> <span className="text-ink-secondary">{profile?.name || '—'}</span></p>
          <p><span className="text-ink-muted">E-mail:</span> <span className="text-ink-secondary">{profile?.email}</span></p>
          <p><span className="text-ink-muted">Plano:</span> <span className="text-ink-secondary">{profile?.plan === 'pro' ? 'PRO' : 'Free'}</span></p>
        </div>
      </Card>

      <Card className="border-error/30">
        <div className="flex gap-3">
          <AlertTriangle className="h-5 w-5 text-error shrink-0 mt-0.5" />
          <div className="flex-1">
            <h3 className="font-semibold text-error mb-1">Excluir conta</h3>
            <p className="text-sm text-ink-secondary mb-4">
              Isso apaga permanentemente seus questionários, planos alimentares, histórico de chat,
              análises de refeição, registros de água/calorias e fotos enviadas. Se você tiver uma
              assinatura com renovação automática, ela será cancelada. Essa ação não pode ser desfeita.
            </p>

            {!confirming ? (
              <Button variant="outline" className="border-error/40 text-error hover:bg-error/5" onClick={() => setConfirming(true)}>
                <Trash2 className="h-4 w-4" /> Excluir minha conta
              </Button>
            ) : (
              <div className="space-y-3 rounded-md border border-error/30 bg-error/5 p-4">
                <p className="text-sm text-error font-medium">
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
                    className="flex-1 bg-error hover:bg-error/90"
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

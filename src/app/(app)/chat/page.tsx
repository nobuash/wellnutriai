'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { createClient } from '@/lib/supabase/client';
import { cn } from '@/lib/utils';
import type { ChatMessage } from '@/types/database';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Lock, Send, Sparkles } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

export default function ChatPage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: profile } = useQuery({
    queryKey: ['profile'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await supabase.from('profiles').select('plan').eq('id', user.id).single();
      return data;
    },
  });

  const { data: messages = [] } = useQuery({
    queryKey: ['chat-messages'],
    enabled: profile?.plan === 'pro',
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from('chat_messages')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: true });
      return (data ?? []) as ChatMessage[];
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages]);

  const send = useMutation({
    mutationFn: async (message: string) => {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro no envio');
      return data.reply as string;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['chat-messages'] });
      setInput('');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!input.trim() || send.isPending) return;
    send.mutate(input.trim());
  }

  // Gate para plano free
  if (profile && profile.plan !== 'pro') {
    return (
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold">Chat com IA</h1>
          <p className="text-sm text-slate-500">Tire dúvidas, peça substituições ou ajustes no seu plano.</p>
        </div>
        <Card className="text-center py-12 space-y-4">
          <div className="flex justify-center">
            <div className="h-16 w-16 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
              <Lock className="h-8 w-8" />
            </div>
          </div>
          <div>
            <h2 className="text-xl font-bold">Recurso exclusivo PRO</h2>
            <p className="text-slate-500 mt-1 max-w-sm mx-auto">
              O chat com IA está disponível apenas no plano PRO. Faça upgrade para conversar
              com a IA sobre seu plano alimentar sem limites.
            </p>
          </div>
          <Link href="/pricing">
            <Button>
              <Sparkles className="h-4 w-4" />
              Fazer upgrade para PRO — R$ 29,90/mês
            </Button>
          </Link>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold">Chat com IA</h1>
        <p className="text-sm text-slate-500">
          Tire dúvidas, peça substituições ou ajustes no seu plano sugerido.
        </p>
      </div>

      <Card className="p-0 overflow-hidden flex flex-col h-[65vh]">
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-6 space-y-4">
          {messages.length === 0 && (
            <div className="text-center text-slate-400 text-sm py-16">
              Envie sua primeira mensagem
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'max-w-[80%] rounded-2xl px-4 py-2.5 text-sm animate-fade-in',
                m.role === 'user'
                  ? 'ml-auto bg-brand-600 text-white rounded-br-sm'
                  : 'bg-slate-100 text-slate-800 rounded-bl-sm',
              )}
            >
              {m.message}
            </div>
          ))}
          {send.isPending && (
            <div className="bg-slate-100 rounded-2xl rounded-bl-sm px-4 py-2.5 w-fit">
              <div className="flex gap-1">
                <span className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="h-2 w-2 bg-slate-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          )}
        </div>

        <form onSubmit={handleSubmit} className="border-t border-slate-200 p-4 flex gap-2">
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Pergunte algo sobre seu plano..."
            className="flex-1 h-10 px-3 rounded-lg border border-slate-300 text-sm focus:ring-2 focus:ring-brand-500 focus:outline-none"
            disabled={send.isPending}
          />
          <Button type="submit" disabled={!input.trim() || send.isPending}>
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </Card>
    </div>
  );
}

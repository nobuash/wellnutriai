'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { addCalorieLog } from '@/components/CalorieWidget';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';
import type { MealPhotoAnalysis, NaoIdentificado, NutritionAnalysisItem, NutritionAnalysisResult } from '@/types/database';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Badge } from '@/components/ui/Badge';
import { Camera, Flame, Sparkles, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

type Mode = 'photo' | 'text';

export default function PhotoAnalysisPage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('photo');
  const [preview, setPreview] = useState<string | null>(null);
  const [textInput, setTextInput] = useState('');
  const [result, setResult] = useState<NutritionAnalysisResult | null>(null);
  const [pendingIndexes, setPendingIndexes] = useState<Set<number>>(new Set());
  const [resolvedItems, setResolvedItems] = useState<NutritionAnalysisItem[]>([]);
  const [addedToCalories, setAddedToCalories] = useState(false);
  const today = new Date().toISOString().split('T')[0];

  const { data: history = [] } = useQuery({
    queryKey: ['photo-history'],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await supabase
        .from('meal_photo_analysis')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(10);
      return (data ?? []) as MealPhotoAnalysis[];
    },
  });

  function resetResult(newResult: NutritionAnalysisResult) {
    setResult(newResult);
    setPendingIndexes(new Set(newResult.nao_identificados.map((_, i) => i)));
    setResolvedItems([]);
    setAddedToCalories(false);
  }

  const analyze = useMutation({
    mutationFn: async (body: { mode: 'photo'; image: string } | { mode: 'text'; input: string }) => {
      const res = await fetch('/api/nutrition/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.upgrade) toast.error(data.error, { action: { label: 'Upgrade', onClick: () => router.push('/pricing') } });
        else toast.error(data.error || 'Erro na análise');
        throw new Error(data.error);
      }
      return data.result as NutritionAnalysisResult;
    },
    onSuccess: (newResult) => {
      toast.success('Análise concluída!');
      qc.invalidateQueries({ queryKey: ['photo-history'] });
      resetResult(newResult);
      if (mode === 'photo') {
        setPreview(null);
        if (fileRef.current) fileRef.current.value = '';
      } else {
        setTextInput('');
      }
    },
  });

  // Resolve um item de nao_identificados contra um candidato escolhido
  // — sem chamar o LLM de novo (ver src/app/api/nutrition/resolve).
  const resolve = useMutation({
    mutationFn: async ({ tacoId, gramas }: { tacoId: string; gramas: number }) => {
      const res = await fetch('/api/nutrition/resolve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [{ tacoId, gramas }] }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Erro ao resolver alimento');
      return data as { itens: NutritionAnalysisItem[] };
    },
    onError: () => toast.error('Erro ao resolver alimento'),
  });

  function handleResolve(index: number, tacoId: string, gramas: number) {
    resolve.mutate(
      { tacoId, gramas },
      {
        onSuccess: (data) => {
          setResolvedItems((prev) => [...prev, ...data.itens]);
          setPendingIndexes((prev) => {
            const next = new Set(prev);
            next.delete(index);
            return next;
          });
        },
      },
    );
  }

  // Adicionar resultado à meta de calorias diária
  const addCalorieMutation = useMutation({
    mutationFn: async () => {
      if (!result) throw new Error('Sem resultado');
      const allItems = [...result.itens, ...resolvedItems];
      const description = allItems.map((f) => f.nome).join(', ').slice(0, 120);
      await addCalorieLog(supabase, totalKcal, description);
    },
    onSuccess: () => {
      setAddedToCalories(true);
      qc.invalidateQueries({ queryKey: ['calorie-logs', today] });
      toast.success('Refeição adicionada à meta de calorias!');
    },
    onError: () => toast.error('Erro ao adicionar calorias'),
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error('Imagem muito grande (máx 5MB)'); return; }
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }

  const totalKcal = (result?.totais.kcal ?? 0) + resolvedItems.reduce((s, i) => s + i.kcal, 0);
  const allDisplayItems = result ? [...result.itens, ...resolvedItems] : [];
  const hasEstimated = allDisplayItems.some((i) => i.estimado);
  const pendingNaoIdentificados: Array<[number, NaoIdentificado]> = result
    ? result.nao_identificados.map((n, i): [number, NaoIdentificado] => [i, n]).filter(([i]) => pendingIndexes.has(i))
    : [];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl text-ink flex items-center gap-2">
          Análise inteligente da sua refeição
          <Badge variant="warning">PRO</Badge>
        </h1>
        <p className="text-sm text-ink-muted">
          Envie uma foto ou descreva o que comeu para receber uma estimativa nutricional, com
          valores da Tabela TACO/Unicamp.
        </p>
      </div>

      {/* Seletor de modo */}
      <div className="flex gap-2 p-1 bg-surface-secondary rounded-lg w-fit">
        <button
          onClick={() => setMode('photo')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === 'photo' ? 'bg-white shadow-sm text-ink' : 'text-ink-muted hover:text-ink-secondary'
          }`}
        >
          <Camera className="h-4 w-4" /> Por foto
        </button>
        <button
          onClick={() => setMode('text')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === 'text' ? 'bg-white shadow-sm text-ink' : 'text-ink-muted hover:text-ink-secondary'
          }`}
        >
          <Sparkles className="h-4 w-4" /> Por texto
        </button>
      </div>

      {/* Modo foto */}
      {mode === 'photo' && (
        <Card>
          <div className="space-y-4">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-border rounded-md p-8 text-center cursor-pointer hover:border-primary-300 hover:bg-primary-50/30 transition-colors duration-200"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="preview" className="max-h-64 mx-auto rounded-sm" />
              ) : (
                <>
                  <Upload className="h-10 w-10 text-ink-muted mx-auto mb-3" />
                  <p className="text-sm text-ink-secondary font-medium">Clique para enviar uma foto</p>
                  <p className="text-xs text-ink-muted mt-1">JPEG, PNG ou WebP (máx 5MB)</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} className="hidden" />
            {preview && (
              <Button className="w-full" loading={analyze.isPending} onClick={() => analyze.mutate({ mode: 'photo', image: preview })}>
                <Sparkles className="h-4 w-4" /> Analisar refeição
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Modo texto */}
      {mode === 'text' && (
        <Card>
          <div className="space-y-4">
            <div>
              <label className="text-sm text-ink-secondary block mb-2">
                Descreva o que você comeu — pode informar a quantidade ou não
              </label>
              <textarea
                value={textInput}
                onChange={(e) => setTextInput(e.target.value)}
                rows={3}
                placeholder="ex: 150g de arroz, 100g de frango grelhado e um pouco de feijão"
                className="w-full px-3 py-2 rounded-sm border border-border text-sm focus:ring-2 focus:ring-primary-500 focus:outline-none"
              />
            </div>
            <Button
              className="w-full"
              loading={analyze.isPending}
              disabled={!textInput.trim()}
              onClick={() => analyze.mutate({ mode: 'text', input: textInput.trim() })}
            >
              <Sparkles className="h-4 w-4" /> Calcular
            </Button>
          </div>
        </Card>
      )}

      {/* Resultado */}
      {result && (
        <Card className="animate-slide-up">
          <h2 className="font-semibold text-ink mb-3 flex items-center gap-2">
            <Camera className="h-4 w-4 text-primary-600" />
            Resultado da análise
          </h2>
          <div className="space-y-3">
            <div className="rounded-sm bg-surface-secondary p-4">
              <p className="text-xs text-ink-muted uppercase tracking-wide mb-1">Total calculado</p>
              <p className="text-2xl font-semibold text-ink">{totalKcal} kcal</p>
            </div>

            {allDisplayItems.length > 0 && (
              <ul className="space-y-2">
                {allDisplayItems.map((f, i) => (
                  <li key={i} className="text-sm border-b border-divider pb-2">
                    <div className="flex justify-between">
                      <span className="text-ink-secondary font-medium">
                        {f.nome}
                        {f.estimado && <span className="text-ink-muted font-normal"> (estimado)</span>}
                      </span>
                      <span className="text-ink-muted">{f.kcal} kcal</span>
                    </div>
                    <div className="flex gap-3 mt-0.5 text-xs text-ink-muted">
                      <span>{f.gramas}g</span>
                      <span>P: {f.proteina_g}g</span>
                      <span>C: {f.carbo_g}g</span>
                      <span>G: {f.gordura_g}g</span>
                      <span>Fibra: {f.fibra_g}g</span>
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* Alimentos não identificados — nunca um valor inventado, sempre desambiguação */}
            {pendingNaoIdentificados.length > 0 && (
              <div className="rounded-sm border border-warning/30 bg-warning/5 p-3 space-y-3">
                <p className="text-sm font-medium text-ink">
                  {pendingNaoIdentificados.length} alimento(s) não identificado(s) com segurança
                </p>
                {pendingNaoIdentificados.map(([index, item]) => (
                  <div key={index} className="text-sm">
                    <p className="text-ink-secondary">
                      &quot;{item.alimento}&quot; ({item.gramas}g) — qual desses é o alimento certo?
                    </p>
                    {item.candidatos.length > 0 ? (
                      <div className="flex flex-wrap gap-2 mt-1.5">
                        {item.candidatos.map((c) => (
                          <button
                            key={c.id}
                            onClick={() => handleResolve(index, c.id, item.gramas)}
                            disabled={resolve.isPending}
                            className="text-xs px-2.5 py-1 rounded-full border border-border bg-surface hover:border-primary-300 hover:bg-primary-50 transition-colors disabled:opacity-50"
                          >
                            {c.nome}
                          </button>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-ink-muted mt-1">
                        Não encontramos nada parecido na tabela — não incluído no total.
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}

            {result.comentario && <p className="text-sm text-ink-secondary">{result.comentario}</p>}

            {hasEstimated && (
              <p className="text-xs text-ink-muted">
                Porções estimadas por IA · Valores nutricionais: Tabela TACO/Unicamp
              </p>
            )}
            <Disclaimer variant="warning">
              Estimativa de porção gerada por IA; valores nutricionais vêm da Tabela TACO/Unicamp e não
              substituem avaliação de um(a) nutricionista.
            </Disclaimer>

            <button
              onClick={() => addCalorieMutation.mutate()}
              disabled={addedToCalories || addCalorieMutation.isPending || allDisplayItems.length === 0}
              className={`w-full flex items-center justify-center gap-2 rounded-md py-3 px-4 text-sm font-semibold transition-all duration-200 ${
                addedToCalories
                  ? 'bg-red-50 text-red-400 cursor-default border border-red-100'
                  : 'bg-red-500 hover:bg-red-600 active:scale-[0.98] text-white shadow-soft disabled:opacity-60'
              }`}
            >
              <Flame className="h-4 w-4" />
              {addedToCalories
                ? 'Adicionado à meta de calorias ✓'
                : addCalorieMutation.isPending
                  ? 'Adicionando...'
                  : 'Adicionar refeição na meta de calorias'}
            </button>
          </div>
        </Card>
      )}

      {/* Histórico */}
      {history.length > 0 && (
        <div>
          <h2 className="font-semibold text-ink mb-3">Histórico</h2>
          <div className="space-y-2">
            {history.map((h) => (
              <Card key={h.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm text-ink">
                    {h.result.totais.kcal} kcal
                  </p>
                  <p className="text-xs text-ink-muted">{formatDate(h.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-ink-muted">
                    {h.result.itens.length} alimento(s)
                  </p>
                  {(h.image_url === 'manual' || h.image_url === 'text') && (
                    <Badge variant="neutral" className="mt-1">texto</Badge>
                  )}
                </div>
              </Card>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

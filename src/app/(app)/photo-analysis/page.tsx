'use client';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Disclaimer } from '@/components/ui/Disclaimer';
import { Input } from '@/components/ui/Input';
import { createClient } from '@/lib/supabase/client';
import { formatDate } from '@/lib/utils';
import type { MealPhotoAnalysis, PhotoAnalysisResult } from '@/types/database';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Camera, Plus, Sparkles, Trash2, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

type Mode = 'photo' | 'manual';

interface ManualFood { name: string; grams: string }

interface ManualResult {
  foods: Array<{ name: string; grams: number; estimated_calories: number; macros?: { protein_g: number; carbs_g: number; fat_g: number } }>;
  total_calories_estimate: number;
  notes: string;
  disclaimer: string;
}

export default function PhotoAnalysisPage() {
  const supabase = createClient();
  const qc = useQueryClient();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  const [mode, setMode] = useState<Mode>('photo');
  const [preview, setPreview] = useState<string | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [manualFoods, setManualFoods] = useState<ManualFood[]>([{ name: '', grams: '' }]);

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

  // Análise por foto
  const analyzePhoto = useMutation({
    mutationFn: async (f: File) => {
      const form = new FormData();
      form.append('image', f);
      const res = await fetch('/api/photo-analysis', { method: 'POST', body: form });
      const data = await res.json();
      if (!res.ok) {
        if (data.upgrade) toast.error(data.error, { action: { label: 'Upgrade', onClick: () => router.push('/pricing') } });
        else toast.error(data.error || 'Erro na análise');
        throw new Error(data.error);
      }
      return data.result as PhotoAnalysisResult;
    },
    onSuccess: () => {
      toast.success('Análise concluída!');
      qc.invalidateQueries({ queryKey: ['photo-history'] });
      setFile(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = '';
    },
  });

  // Análise manual por gramas
  const analyzeManual = useMutation({
    mutationFn: async (foods: ManualFood[]) => {
      const payload = foods
        .filter((f) => f.name.trim() && f.grams)
        .map((f) => ({ name: f.name.trim(), grams: parseFloat(f.grams) }));

      if (payload.length === 0) throw new Error('Informe pelo menos um alimento');

      const res = await fetch('/api/photo-analysis/manual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ foods: payload }),
      });
      const data = await res.json();
      if (!res.ok) {
        if (data.upgrade) toast.error(data.error, { action: { label: 'Upgrade', onClick: () => router.push('/pricing') } });
        else toast.error(data.error || 'Erro na análise');
        throw new Error(data.error);
      }
      return data.result as ManualResult;
    },
    onSuccess: () => {
      toast.success('Análise concluída!');
      qc.invalidateQueries({ queryKey: ['photo-history'] });
    },
  });

  function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    if (f.size > 5 * 1024 * 1024) { toast.error('Imagem muito grande (máx 5MB)'); return; }
    setFile(f);
    const reader = new FileReader();
    reader.onload = () => setPreview(reader.result as string);
    reader.readAsDataURL(f);
  }

  function addFood() {
    setManualFoods((prev) => [...prev, { name: '', grams: '' }]);
  }

  function removeFood(i: number) {
    setManualFoods((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateFood(i: number, field: keyof ManualFood, value: string) {
    setManualFoods((prev) => prev.map((f, idx) => idx === i ? { ...f, [field]: value } : f));
  }

  const result = mode === 'photo' ? analyzePhoto.data : analyzeManual.data;
  const isPending = mode === 'photo' ? analyzePhoto.isPending : analyzeManual.isPending;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          Análise de refeição
          <span className="text-xs px-2 py-0.5 rounded bg-amber-100 text-amber-700 font-semibold">PRO</span>
        </h1>
        <p className="text-sm text-slate-500">
          Estime calorias por foto ou informando os alimentos e gramas manualmente.
        </p>
      </div>

      {/* Seletor de modo */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
        <button
          onClick={() => setMode('photo')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === 'photo' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Camera className="h-4 w-4" /> Por foto
        </button>
        <button
          onClick={() => setMode('manual')}
          className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors ${
            mode === 'manual' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          <Sparkles className="h-4 w-4" /> Por gramas
        </button>
      </div>

      {/* Modo foto */}
      {mode === 'photo' && (
        <Card>
          <div className="space-y-4">
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-300 rounded-xl p-8 text-center cursor-pointer hover:border-brand-400 hover:bg-brand-50/30 transition-colors"
            >
              {preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={preview} alt="preview" className="max-h-64 mx-auto rounded-lg" />
              ) : (
                <>
                  <Upload className="h-10 w-10 text-slate-400 mx-auto mb-3" />
                  <p className="text-sm text-slate-600 font-medium">Clique para enviar uma foto</p>
                  <p className="text-xs text-slate-500 mt-1">JPEG, PNG ou WebP (máx 5MB)</p>
                </>
              )}
            </div>
            <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={handleFile} className="hidden" />
            {file && (
              <Button className="w-full" loading={isPending} onClick={() => analyzePhoto.mutate(file)}>
                <Sparkles className="h-4 w-4" /> Analisar refeição
              </Button>
            )}
          </div>
        </Card>
      )}

      {/* Modo manual */}
      {mode === 'manual' && (
        <Card>
          <div className="space-y-4">
            <p className="text-sm text-slate-600">
              Informe cada alimento e a quantidade em gramas para obter uma estimativa calórica.
            </p>

            <div className="space-y-3">
              {manualFoods.map((food, i) => (
                <div key={i} className="flex gap-2 items-end">
                  <div className="flex-1">
                    {i === 0 && <label className="text-xs text-slate-500 mb-1 block">Alimento</label>}
                    <Input
                      placeholder="ex: arroz branco, frango grelhado..."
                      value={food.name}
                      onChange={(e) => updateFood(i, 'name', e.target.value)}
                    />
                  </div>
                  <div className="w-28">
                    {i === 0 && <label className="text-xs text-slate-500 mb-1 block">Gramas</label>}
                    <Input
                      type="number"
                      placeholder="150"
                      min="1"
                      value={food.grams}
                      onChange={(e) => updateFood(i, 'grams', e.target.value)}
                    />
                  </div>
                  {manualFoods.length > 1 && (
                    <button
                      onClick={() => removeFood(i)}
                      className="mb-0 p-2 text-slate-400 hover:text-red-500 transition-colors"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div className="flex gap-2">
              <Button variant="outline" onClick={addFood} className="flex-1">
                <Plus className="h-4 w-4" /> Adicionar alimento
              </Button>
              <Button
                className="flex-1"
                loading={isPending}
                onClick={() => analyzeManual.mutate(manualFoods)}
                disabled={!manualFoods.some((f) => f.name.trim() && f.grams)}
              >
                <Sparkles className="h-4 w-4" /> Calcular
              </Button>
            </div>
          </div>
        </Card>
      )}

      {/* Resultado */}
      {result && (
        <Card className="animate-slide-up">
          <h2 className="font-semibold mb-3 flex items-center gap-2">
            <Camera className="h-4 w-4 text-brand-600" />
            Resultado da análise
          </h2>
          <div className="space-y-3">
            <div className="rounded-lg bg-slate-50 p-4">
              <p className="text-xs text-slate-500 uppercase mb-1">Estimativa total</p>
              <p className="text-2xl font-bold">{result.total_calories_estimate} kcal</p>
            </div>

            <ul className="space-y-2">
              {(result.foods as Array<{
                name: string;
                estimated_calories: number;
                grams?: number;
                macros?: { protein_g: number; carbs_g: number; fat_g: number };
              }>).map((f, i) => (
                <li key={i} className="text-sm border-b border-slate-100 pb-2">
                  <div className="flex justify-between">
                    <span className="text-slate-700 font-medium">{f.name}</span>
                    <span className="text-slate-500">~{f.estimated_calories} kcal</span>
                  </div>
                  {f.grams !== undefined && (
                    <div className="flex gap-3 mt-0.5 text-xs text-slate-400">
                      <span>{f.grams}g</span>
                      {f.macros && (
                        <>
                          <span>P: {f.macros.protein_g}g</span>
                          <span>C: {f.macros.carbs_g}g</span>
                          <span>G: {f.macros.fat_g}g</span>
                        </>
                      )}
                    </div>
                  )}
                </li>
              ))}
            </ul>

            {result.notes && <p className="text-sm text-slate-600">{result.notes}</p>}
            <Disclaimer variant="warning">{result.disclaimer}</Disclaimer>
          </div>
        </Card>
      )}

      {/* Histórico */}
      {history.length > 0 && (
        <div>
          <h2 className="font-semibold mb-3">Histórico</h2>
          <div className="space-y-2">
            {history.map((h) => (
              <Card key={h.id} className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-sm">
                    {(h.result as PhotoAnalysisResult).total_calories_estimate} kcal estimadas
                  </p>
                  <p className="text-xs text-slate-500">{formatDate(h.created_at)}</p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-slate-500">
                    {(h.result as PhotoAnalysisResult).foods.length} alimentos
                  </p>
                  {h.image_url === 'manual' && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">manual</span>
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

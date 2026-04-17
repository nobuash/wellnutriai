import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { Brain, Camera, Check, MessageCircle, Sparkles } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* NAV */}
      <nav className="border-b border-slate-200 bg-white/80 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-bold text-lg">
            <Image src="/Logo WellNutri.png" alt="WellNutriAI" width={28} height={28} />
            WellNutriAI
          </Link>
          <div className="flex items-center gap-3">
            <Link href="/login">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
            <Link href="/signup">
              <Button size="sm">Criar conta</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO */}
      <section className="mx-auto max-w-6xl px-6 py-20 text-center">
        <div className="inline-flex items-center gap-2 rounded-full border border-brand-200 bg-brand-50 px-4 py-1.5 text-sm text-brand-700 mb-6">
          <Sparkles className="h-4 w-4" />
          Planos alimentares sugeridos por IA
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight text-slate-900 mb-6">
          Nutrição inteligente,<br />
          <span className="text-brand-600">feita para você</span>
        </h1>
        <p className="text-xl text-slate-600 max-w-2xl mx-auto mb-10">
          Receba sugestões alimentares personalizadas com base no seu perfil, objetivo e rotina —
          geradas por inteligência artificial em segundos.
        </p>
        <div className="flex items-center justify-center gap-3">
          <Link href="/signup">
            <Button size="lg">Começar grátis</Button>
          </Link>
          <Link href="#como-funciona">
            <Button variant="outline" size="lg">Como funciona</Button>
          </Link>
        </div>
        <p className="text-xs text-slate-500 mt-6 max-w-md mx-auto">
          O WellNutriAI não substitui nutricionista ou profissional de saúde.
          As recomendações são geradas por IA.
        </p>
      </section>

      {/* BENEFÍCIOS */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-slate-100">
        <h2 className="text-3xl font-bold text-center mb-12">Recursos principais</h2>
        <div className="grid md:grid-cols-3 gap-6">
          {[
            {
              icon: Brain,
              title: 'Plano sugerido por IA',
              desc: 'Sugestões alimentares personalizadas com base no seu questionário nutricional.',
            },
            {
              icon: MessageCircle,
              title: 'Chat inteligente',
              desc: 'Tire dúvidas, peça substituições e ajustes no seu plano com nosso assistente.',
            },
            {
              icon: Camera,
              title: 'Análise por foto',
              desc: 'Tire uma foto da refeição e receba uma estimativa dos alimentos e calorias.',
            },
          ].map(({ icon: Icon, title, desc }) => (
            <div key={title} className="rounded-xl border border-slate-200 p-6">
              <div className="h-10 w-10 rounded-lg bg-brand-50 text-brand-600 flex items-center justify-center mb-4">
                <Icon className="h-5 w-5" />
              </div>
              <h3 className="font-semibold text-lg mb-2">{title}</h3>
              <p className="text-slate-600 text-sm">{desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="bg-slate-50 py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="text-3xl font-bold text-center mb-12">Como funciona</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-8">
            {[
              { n: '1', t: 'Crie sua conta', d: 'Cadastre-se em segundos e aceite os termos de uso.' },
              { n: '2', t: 'Responda o questionário', d: 'Nos conte sobre seus objetivos, rotina e preferências alimentares.' },
              { n: '3', t: 'Receba seu plano', d: 'A IA gera um plano alimentar sugerido, pronto para você seguir.' },
              { n: '4', t: 'Analise sua refeição', d: 'Tire uma foto do seu prato e descubra as calorias e nutrientes estimados.' },
            ].map((s) => (
              <div key={s.n} className="text-center">
                <div className="h-12 w-12 mx-auto rounded-full bg-brand-600 text-white flex items-center justify-center text-lg font-bold mb-4">
                  {s.n}
                </div>
                <h3 className="font-semibold text-lg mb-2">{s.t}</h3>
                <p className="text-slate-600 text-sm">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLANOS */}
      <section id="planos" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="text-3xl font-bold text-center mb-12">Planos simples e claros</h2>
        <div className="grid md:grid-cols-2 gap-6 max-w-3xl mx-auto">
          <PlanCard
            name="Free"
            price="R$ 0"
            desc="Para conhecer a plataforma"
            features={['1 plano alimentar sugerido', 'Plano não pode ser alterado após gerado', 'Chat limitado', 'Sem análise por foto']}
            cta="Começar grátis"
            ctaHref="/signup"
          />
          <PlanCard
            highlight
            name="Pro"
            price="R$ 29,90/mês"
            desc="Experiência completa"
            features={['Planos ilimitados e editáveis', 'Chat completo', 'Análise por foto', 'Suporte prioritário']}
            cta="Assinar Pro"
            ctaHref="/signup"
          />
        </div>
      </section>

      {/* CTA */}
      <section className="bg-brand-600 text-white py-20 text-center">
        <div className="mx-auto max-w-3xl px-6">
          <h2 className="text-4xl font-bold mb-4">Pronto para começar?</h2>
          <p className="text-brand-50 mb-8 text-lg">
            Crie sua conta gratuita e receba seu primeiro plano alimentar em minutos.
          </p>
          <Link href="/signup">
            <Button size="lg" variant="secondary">Criar conta grátis</Button>
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-slate-200 py-8 text-center text-sm text-slate-500">
        <p>© {new Date().getFullYear()} WellNutriAI. Todos os direitos reservados.</p>
        <p className="mt-1 max-w-2xl mx-auto px-6">
          O WellNutriAI fornece sugestões alimentares geradas por IA com caráter informativo e
          não substitui profissional de saúde.
        </p>
      </footer>
    </div>
  );
}

function PlanCard({
  name, price, desc, features, cta, ctaHref, highlight,
}: {
  name: string; price: string; desc: string; features: string[];
  cta: string; ctaHref: string; highlight?: boolean;
}) {
  return (
    <div
      className={`rounded-2xl border p-8 ${
        highlight ? 'border-brand-500 bg-brand-50 shadow-lg' : 'border-slate-200 bg-white'
      }`}
    >
      <h3 className="font-bold text-xl mb-1">{name}</h3>
      <p className="text-sm text-slate-500 mb-4">{desc}</p>
      <p className="text-3xl font-bold mb-6">{price}</p>
      <ul className="space-y-2 mb-8">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm text-slate-700">
            <Check className="h-4 w-4 text-brand-600" />
            {f}
          </li>
        ))}
      </ul>
      <Link href={ctaHref}>
        <Button className="w-full" variant={highlight ? 'primary' : 'outline'}>{cta}</Button>
      </Link>
    </div>
  );
}

import Link from 'next/link';
import Image from 'next/image';
import { Button } from '@/components/ui/Button';
import { SocialLinks } from '@/components/SocialLinks';
import { Brain, Camera, Check, MessageCircle, Sparkles } from 'lucide-react';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      {/* NAV */}
      <nav className="border-b border-divider bg-background/90 backdrop-blur sticky top-0 z-10">
        <div className="mx-auto max-w-6xl px-6 h-16 flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-display text-lg font-semibold text-ink">
            <Image src="/logo.png" alt="WellNutriAI" width={36} height={36} className="object-contain" />
            WellNutriAI
          </Link>
          <div className="flex items-center gap-5">
            <Link href="/login" className="text-sm font-medium text-ink-secondary hover:text-ink transition-colors">
              Entrar
            </Link>
            <Link href="/signup">
              <Button size="sm" pill>Criar conta</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* HERO — split assimétrico, não centralizado */}
      <section className="mx-auto max-w-6xl px-6 py-16 md:py-20 grid md:grid-cols-[1.1fr_0.9fr] gap-12 md:gap-8 items-center">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-primary-200 bg-primary-50 px-4 py-1.5 text-sm text-primary-700 mb-7">
            <Sparkles className="h-4 w-4" />
            Planos alimentares sugeridos por IA
          </div>
          <h1 className="font-display text-4xl md:text-5xl leading-[1.1] text-ink mb-6">
            Nutrição inteligente,<br />
            <em className="italic font-medium text-primary-600">feita para você</em>
          </h1>
          <p className="text-lg text-ink-secondary max-w-xl mb-9 leading-relaxed">
            Receba sugestões alimentares personalizadas com base no seu perfil, objetivo e rotina —
            geradas por inteligência artificial em segundos.
          </p>
          <div className="flex items-center gap-4">
            <Link href="/signup">
              <Button size="lg" pill>Começar grátis</Button>
            </Link>
            <Link href="#como-funciona" className="text-sm font-medium text-ink-secondary hover:text-ink transition-colors">
              Como funciona
            </Link>
          </div>
          <p className="text-xs text-ink-muted mt-8 max-w-md leading-relaxed">
            O WellNutriAI não substitui nutricionista ou profissional de saúde.
            As recomendações são geradas por IA.
          </p>
        </div>

        {/* Painel gráfico — sem foto de estoque (nenhum asset real disponível
            no projeto); composição em cor sólida + forma orgânica em vez de
            preencher com imagem genérica ou placeholder externo. */}
        <div className="relative aspect-square md:aspect-[4/5] rounded-lg overflow-hidden bg-gradient-to-br from-primary-500 to-primary-700">
          <div
            className="absolute inset-0 opacity-90"
            style={{
              clipPath: 'polygon(0% 15%, 70% 0%, 100% 40%, 100% 100%, 20% 100%, 0% 70%)',
              background: 'linear-gradient(135deg, rgba(255,255,255,0.10), transparent 60%)',
            }}
          />
          <div className="absolute inset-0 flex items-center justify-center">
            <Sparkles className="h-20 w-20 text-white/90" strokeWidth={1.25} />
          </div>
          <div className="absolute bottom-6 left-6 right-6 flex items-center gap-3 rounded-md bg-white/95 backdrop-blur px-4 py-3 shadow-soft-lg">
            <div className="flex -space-x-2">
              <span className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                <Brain className="h-4 w-4 text-primary-700" />
              </span>
              <span className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                <MessageCircle className="h-4 w-4 text-primary-700" />
              </span>
              <span className="h-8 w-8 rounded-full bg-primary-100 flex items-center justify-center">
                <Camera className="h-4 w-4 text-primary-700" />
              </span>
            </div>
            <p className="text-xs text-ink-secondary leading-snug">Plano, chat e análise de foto num só lugar</p>
          </div>
        </div>
      </section>

      {/* BENEFÍCIOS — lista dividida, não 3 cards iguais */}
      <section className="mx-auto max-w-6xl px-6 py-20 border-t border-divider">
        <div className="grid md:grid-cols-[0.9fr_2fr] gap-8 md:gap-16">
          <h2 className="font-display text-3xl text-ink md:sticky md:top-24 self-start">Recursos principais</h2>
          <div className="divide-y divide-divider">
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
              <div key={title} className="flex gap-5 py-7 first:pt-0 last:pb-0">
                <div className="h-11 w-11 shrink-0 rounded-md bg-primary-50 text-primary-600 flex items-center justify-center">
                  <Icon className="h-5 w-5" strokeWidth={1.75} />
                </div>
                <div>
                  <h3 className="font-semibold text-ink text-lg mb-1.5">{title}</h3>
                  <p className="text-ink-secondary text-sm leading-relaxed max-w-md">{desc}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* COMO FUNCIONA */}
      <section id="como-funciona" className="bg-surface-secondary py-20">
        <div className="mx-auto max-w-6xl px-6">
          <h2 className="font-display text-3xl text-ink text-center mb-14">Como funciona</h2>
          <div className="grid sm:grid-cols-2 md:grid-cols-4 gap-10">
            {[
              { n: '1', t: 'Crie sua conta', d: 'Cadastre-se em segundos e aceite os termos de uso.' },
              { n: '2', t: 'Responda o questionário', d: 'Nos conte sobre seus objetivos, rotina e preferências alimentares.' },
              { n: '3', t: 'Receba seu plano', d: 'A IA gera um plano alimentar sugerido, pronto para você seguir.' },
              { n: '4', t: 'Analise sua refeição', d: 'Tire uma foto do seu prato e descubra as calorias e nutrientes estimados.' },
            ].map((s) => (
              <div key={s.n} className="text-center">
                <div className="h-11 w-11 mx-auto rounded-full bg-primary-500 text-white flex items-center justify-center text-base font-semibold mb-5">
                  {s.n}
                </div>
                <h3 className="font-semibold text-ink text-base mb-2">{s.t}</h3>
                <p className="text-ink-secondary text-sm leading-relaxed">{s.d}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* PLANOS */}
      <section id="planos" className="mx-auto max-w-6xl px-6 py-20">
        <h2 className="font-display text-3xl text-ink text-center mb-14">Planos simples e claros</h2>
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
            features={['Até 6 planos alimentares por mês', 'Chat com IA de uso amplo', 'Até 30 análises de refeição por mês', 'Suporte prioritário']}
            cta="Assinar Pro"
            ctaHref="/signup"
          />
        </div>
      </section>

      {/* CTA */}
      <section className="mx-auto max-w-6xl px-6 pb-20">
        <div className="rounded-lg bg-gradient-to-br from-primary-600 to-primary-800 text-white py-16 px-8 text-center">
          <h2 className="font-display text-3xl md:text-4xl mb-4">
            Pronto para <em className="italic">começar</em>?
          </h2>
          <p className="text-primary-50/90 mb-8 text-lg max-w-xl mx-auto">
            Crie sua conta gratuita e receba seu primeiro plano alimentar em minutos.
          </p>
          <Link href="/signup">
            <Button size="lg" variant="secondary" pill>Criar conta grátis</Button>
          </Link>
        </div>
      </section>

      {/* FOOTER */}
      <footer className="border-t border-divider py-10 text-center text-sm text-ink-muted">
        <SocialLinks className="justify-center mb-4" />
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
      className={`rounded-md p-8 ${
        highlight
          ? 'bg-gradient-to-br from-primary-600 to-primary-700 text-white shadow-soft-lg'
          : 'border border-border bg-surface'
      }`}
    >
      <h3 className={`font-display text-xl mb-1 ${highlight ? 'text-white' : 'text-ink'}`}>{name}</h3>
      <p className={`text-sm mb-4 ${highlight ? 'text-primary-50/80' : 'text-ink-muted'}`}>{desc}</p>
      <p className={`text-3xl font-semibold mb-6 ${highlight ? 'text-white' : 'text-ink'}`}>{price}</p>
      <ul className="space-y-2.5 mb-8">
        {features.map((f) => (
          <li key={f} className={`flex items-center gap-2.5 text-sm ${highlight ? 'text-primary-50/90' : 'text-ink-secondary'}`}>
            <Check className={`h-4 w-4 shrink-0 ${highlight ? 'text-white' : 'text-primary-600'}`} />
            {f}
          </li>
        ))}
      </ul>
      <Link href={ctaHref}>
        <Button className="w-full" variant={highlight ? 'secondary' : 'outline'}>{cta}</Button>
      </Link>
    </div>
  );
}

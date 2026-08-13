'use client';

import Link from 'next/link';
import { Cookie } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useCookieConsent } from '@/lib/cookieConsent';
import { GoogleAnalytics } from './GoogleAnalytics';

const GA_CONFIGURED = Boolean(process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID);

// Só existe tracker não-essencial (GA4) se a variável de ambiente
// estiver configurada — sem ela, não há nada para pedir consentimento
// e o banner nem aparece. Com ela, o GA4 só carrega depois de
// consentimento explícito (nunca por padrão, nunca por omissão).
export function ConsentBanner() {
  const { status, grant, deny } = useCookieConsent();

  if (!GA_CONFIGURED) return null;

  return (
    <>
      {status === 'granted' && <GoogleAnalytics />}

      {status === 'unknown' && (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up px-4 pb-4">
          <div className="mx-auto max-w-xl rounded-md border border-border bg-surface shadow-soft-lg p-5">
            <div className="flex gap-3">
              <Cookie className="h-5 w-5 shrink-0 text-primary-600 mt-0.5" strokeWidth={1.75} />
              <p className="text-sm text-ink-secondary leading-relaxed">
                Usamos cookies de análise para entender como o WellNutriAI é usado e melhorar o
                produto. Você pode aceitar ou recusar — isso não afeta o funcionamento da
                plataforma. Veja a{' '}
                <Link href="/privacy" className="text-primary-600 underline">
                  Política de Privacidade
                </Link>
                .
              </p>
            </div>
            <div className="flex items-center justify-end gap-3 mt-4">
              <Button size="sm" variant="ghost" onClick={deny}>Recusar</Button>
              <Button size="sm" onClick={grant}>Aceitar</Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

'use client';

import Script from 'next/script';
import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

// Só carrega se NEXT_PUBLIC_GA_MEASUREMENT_ID estiver definido — sem
// essa variável, nenhum script de terceiro é solicitado. Quem decide
// SE e QUANDO este componente é montado é o ConsentBanner (só depois
// de consentimento explícito do usuário) — não monte este componente
// diretamente em outro lugar do app.
export function GoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || typeof window.gtag !== 'function') return;
    window.gtag('event', 'page_view', { page_path: pathname });
  }, [pathname]);

  if (!GA_MEASUREMENT_ID) return null;

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID}`} strategy="afterInteractive" />
      <Script id="ga4-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_MEASUREMENT_ID}', { anonymize_ip: true, send_page_view: false });
        `}
      </Script>
    </>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Smartphone, X } from 'lucide-react';

const STORAGE_KEY = 'install-prompt-dismissed';

function isMobileDevice(): boolean {
  return /Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent);
}

function isAlreadyInstalled(): boolean {
  // iOS standalone mode
  if ((navigator as Navigator & { standalone?: boolean }).standalone === true) return true;
  // Android / Chrome standalone
  if (window.matchMedia('(display-mode: standalone)').matches) return true;
  return false;
}

export function MobileInstallPrompt() {
  const router = useRouter();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!isMobileDevice()) return;
    if (isAlreadyInstalled()) return;
    if (localStorage.getItem(STORAGE_KEY)) return;

    // Small delay so the page settles before the prompt appears
    const timer = setTimeout(() => setVisible(true), 1200);
    return () => clearTimeout(timer);
  }, []);

  function handleInstall() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
    router.push('/install-app');
  }

  function handleDismiss() {
    localStorage.setItem(STORAGE_KEY, '1');
    setVisible(false);
  }

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/40 z-50"
        onClick={handleDismiss}
      />

      {/* Bottom sheet */}
      <div className="fixed bottom-0 left-0 right-0 z-50 animate-slide-up">
        <div className="bg-surface rounded-t-lg shadow-soft-lg p-6 mx-auto max-w-md">
          {/* Close button */}
          <button
            onClick={handleDismiss}
            className="absolute top-4 right-4 p-1 rounded-full text-ink-muted hover:bg-surface-secondary transition-colors duration-200"
            aria-label="Fechar"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Icon + title */}
          <div className="flex items-center gap-3 mb-3">
            <div className="w-12 h-12 rounded-md bg-primary-50 flex items-center justify-center shrink-0">
              <Smartphone className="h-6 w-6 text-primary-600" strokeWidth={1.75} />
            </div>
            <div>
              <p className="font-semibold text-ink text-base leading-tight">
                Instale o WellNutriAI
              </p>
              <p className="text-xs text-ink-muted mt-0.5">
                Acesse mais rápido direto da tela inicial
              </p>
            </div>
          </div>

          <p className="text-sm text-ink-secondary mb-5">
            Deseja adicionar o aplicativo à tela inicial do seu celular para uma experiência completa?
          </p>

          <div className="flex flex-col gap-2">
            <button
              onClick={handleInstall}
              className="w-full py-3 rounded-md bg-primary-600 hover:bg-primary-700 text-white font-semibold text-sm transition-colors duration-200"
            >
              Instalar aplicativo
            </button>
            <button
              onClick={handleDismiss}
              className="w-full py-2.5 rounded-md text-ink-muted hover:bg-surface-secondary font-medium text-sm transition-colors duration-200"
            >
              Agora não
            </button>
          </div>
        </div>
      </div>
    </>
  );
}

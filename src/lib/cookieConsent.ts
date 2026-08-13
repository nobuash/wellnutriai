'use client';

import { useEffect, useState } from 'react';

// Consentimento de cookies/tracking (GA4) — deliberadamente separado do
// aceite de Termos/Privacidade em src/lib/consent.ts, que é outra base
// legal (contratual) e não cobre tracking não-essencial.
const STORAGE_KEY = 'wellnutriai_cookie_consent';

export type ConsentStatus = 'unknown' | 'granted' | 'denied';

function readStoredConsent(): ConsentStatus {
  const value = window.localStorage.getItem(STORAGE_KEY);
  return value === 'granted' || value === 'denied' ? value : 'unknown';
}

export function useCookieConsent() {
  // 'unknown' no primeiro render (server e client) evita mismatch de
  // hidratação — o valor real de localStorage só é lido depois do mount.
  const [status, setStatus] = useState<ConsentStatus>('unknown');

  useEffect(() => {
    setStatus(readStoredConsent());
  }, []);

  function grant() {
    window.localStorage.setItem(STORAGE_KEY, 'granted');
    setStatus('granted');
  }

  function deny() {
    window.localStorage.setItem(STORAGE_KEY, 'denied');
    setStatus('denied');
  }

  return { status, grant, deny };
}

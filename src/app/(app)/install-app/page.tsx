'use client';

import { useState } from 'react';
import { Smartphone, Share, MoreVertical, Plus, Check } from 'lucide-react';

type OS = 'ios' | 'android';

const IOS_STEPS = [
  {
    number: 1,
    title: 'Abra o Safari',
    description: 'Acesse wellnutriai.com pelo Safari. O app só pode ser instalado pelo Safari no iPhone e iPad.',
    visual: <SafariMockup />,
  },
  {
    number: 2,
    title: 'Toque em Compartilhar',
    description: 'Toque no ícone de compartilhar na barra inferior do Safari — é um quadrado com uma seta apontando para cima.',
    visual: <ShareButtonMockup />,
  },
  {
    number: 3,
    title: 'Adicionar à Tela de Início',
    description: 'Role o menu para baixo e toque em "Adicionar à Tela de Início". Se não aparecer, role mais um pouco.',
    visual: <AddToHomeMockupIOS />,
  },
  {
    number: 4,
    title: 'Confirme e toque em Adicionar',
    description: 'O nome "WellNutriAI" já vai aparecer preenchido. Toque em "Adicionar" no canto superior direito.',
    visual: <ConfirmMockupIOS />,
  },
];

const ANDROID_STEPS = [
  {
    number: 1,
    title: 'Abra o Chrome',
    description: 'Acesse wellnutriai.com pelo Chrome. A instalação também funciona no Samsung Internet e Edge.',
    visual: <ChromeMockup />,
  },
  {
    number: 2,
    title: 'Toque no menu',
    description: 'Toque nos três pontinhos (⋮) no canto superior direito do Chrome para abrir o menu.',
    visual: <ChromeMenuMockup />,
  },
  {
    number: 3,
    title: 'Adicionar à tela inicial',
    description: 'Toque em "Adicionar à tela inicial". Em alguns celulares, pode aparecer um banner automático na parte de baixo da tela.',
    visual: <AddToHomeMockupAndroid />,
  },
  {
    number: 4,
    title: 'Confirme a instalação',
    description: 'Toque em "Adicionar" ou "Instalar" na janela de confirmação. O ícone do WellNutriAI vai aparecer na sua tela inicial.',
    visual: <ConfirmMockupAndroid />,
  },
];

export default function InstallAppPage() {
  const [os, setOs] = useState<OS>('ios');
  const steps = os === 'ios' ? IOS_STEPS : ANDROID_STEPS;

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Smartphone className="h-6 w-6 text-brand-600" />
          Instalar no celular
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          Use o WellNutriAI como um app nativo — sem precisar de loja de aplicativos.
        </p>
      </div>

      {/* Seletor iOS / Android */}
      <div className="flex gap-2 p-1 bg-slate-100 rounded-lg w-fit">
        <button
          onClick={() => setOs('ios')}
          className={`flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            os === 'ios' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {/* Apple icon SVG */}
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          iPhone / iPad
        </button>
        <button
          onClick={() => setOs('android')}
          className={`flex items-center gap-2 px-5 py-2 rounded-md text-sm font-medium transition-colors ${
            os === 'android' ? 'bg-white shadow-sm text-slate-900' : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {/* Android icon SVG */}
          <svg className="h-4 w-4" viewBox="0 0 24 24" fill="currentColor">
            <path d="M17.523 15.341a1 1 0 1 1-2 0 1 1 0 0 1 2 0m-9.046 0a1 1 0 1 1-2 0 1 1 0 0 1 2 0M2.89 7.622l1.867-3.233a.4.4 0 0 1 .694.394L3.59 7.898A12.05 12.05 0 0 1 8 6.54V6a4 4 0 0 1 8 0v.54a12.05 12.05 0 0 1 4.41 1.358l-1.86-3.115a.4.4 0 0 1 .693-.394l1.867 3.233C23.124 9.012 24 11.338 24 14H0c0-2.662.876-4.988 2.89-6.378M0 15c0 3.866 3.582 7 8 7h8c4.418 0 8-3.134 8-7H0z"/>
          </svg>
          Android
        </button>
      </div>

      {/* Aviso especial iOS */}
      {os === 'ios' && (
        <div className="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          <svg className="h-5 w-5 shrink-0 mt-0.5" viewBox="0 0 24 24" fill="currentColor">
            <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z"/>
          </svg>
          <span><strong>Importante:</strong> No iPhone e iPad, a instalação funciona <strong>apenas pelo Safari</strong>. Chrome, Firefox e outros browsers não suportam essa função no iOS.</span>
        </div>
      )}

      {/* Passos */}
      <div className="space-y-6">
        {steps.map((step, idx) => (
          <div key={step.number} className="relative">
            {/* Linha conectora */}
            {idx < steps.length - 1 && (
              <div className="absolute left-5 top-12 bottom-0 w-0.5 bg-slate-100" style={{ height: 'calc(100% + 1.5rem)' }} />
            )}

            <div className="flex gap-4">
              {/* Número */}
              <div className={`shrink-0 h-10 w-10 rounded-full flex items-center justify-center font-bold text-sm z-10 ${
                os === 'ios'
                  ? 'bg-slate-900 text-white'
                  : 'bg-green-600 text-white'
              }`}>
                {step.number}
              </div>

              <div className="flex-1 pb-6">
                <h3 className="font-semibold text-slate-800 mb-1">{step.title}</h3>
                <p className="text-sm text-slate-500 mb-4">{step.description}</p>

                {/* Mockup visual */}
                <div className="flex justify-center">
                  {step.visual}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Resultado final */}
      <div className={`rounded-2xl p-5 text-center ${os === 'ios' ? 'bg-slate-50 border border-slate-200' : 'bg-green-50 border border-green-200'}`}>
        <div className={`h-14 w-14 rounded-2xl mx-auto mb-3 flex items-center justify-center shadow-md ${os === 'ios' ? 'bg-white' : 'bg-white'}`}>
          <span className="text-3xl">🥗</span>
        </div>
        <p className="font-semibold text-slate-800">Pronto! App instalado.</p>
        <p className="text-sm text-slate-500 mt-1">
          O WellNutriAI vai abrir em tela cheia, sem barra do browser, igual a um app nativo.
        </p>
      </div>
    </div>
  );
}

/* ─── Mockups visuais ─── */

function PhoneFrame({ children, dark = false }: { children: React.ReactNode; dark?: boolean }) {
  return (
    <div className={`relative w-56 rounded-[2rem] border-4 shadow-xl overflow-hidden ${dark ? 'border-slate-800 bg-slate-900' : 'border-slate-300 bg-white'}`}>
      {/* Notch */}
      <div className={`h-6 flex items-center justify-center ${dark ? 'bg-slate-900' : 'bg-white'}`}>
        <div className="h-3 w-16 rounded-full bg-slate-800" />
      </div>
      {children}
      {/* Home bar */}
      <div className={`h-5 flex items-center justify-center ${dark ? 'bg-slate-900' : 'bg-white'}`}>
        <div className="h-1 w-20 rounded-full bg-slate-300" />
      </div>
    </div>
  );
}

function SafariMockup() {
  return (
    <PhoneFrame>
      {/* Safari chrome */}
      <div className="bg-slate-100 px-2 py-1.5">
        <div className="bg-white rounded-lg px-3 py-1 flex items-center gap-1 border border-slate-200">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-[10px] text-slate-500 flex-1 text-center">wellnutriai.com</span>
        </div>
      </div>
      {/* Page content preview */}
      <div className="bg-white px-3 py-4 space-y-2" style={{ minHeight: 140 }}>
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-green-100" />
          <div className="h-3 w-24 rounded bg-slate-200" />
        </div>
        <div className="h-2 w-full rounded bg-slate-100" />
        <div className="h-2 w-4/5 rounded bg-slate-100" />
        <div className="h-8 w-full rounded-lg bg-green-500 mt-3" />
      </div>
      {/* Safari bottom bar */}
      <div className="bg-slate-100 border-t border-slate-200 px-4 py-2 flex items-center justify-between">
        <div className="h-4 w-4 rounded bg-slate-300" />
        <div className="h-4 w-4 rounded bg-slate-300" />
        <div className="flex flex-col items-center gap-0.5 text-blue-500">
          <Share className="h-4 w-4" />
        </div>
        <div className="h-4 w-4 rounded bg-slate-300" />
        <div className="h-4 w-4 rounded bg-slate-300" />
      </div>
    </PhoneFrame>
  );
}

function ShareButtonMockup() {
  return (
    <PhoneFrame>
      <div className="bg-slate-100 px-2 py-1.5">
        <div className="bg-white rounded-lg px-3 py-1 flex items-center gap-1 border border-slate-200">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-[10px] text-slate-500 flex-1 text-center">wellnutriai.com</span>
        </div>
      </div>
      <div className="bg-white px-3 py-4 space-y-2" style={{ minHeight: 140 }}>
        <div className="h-2 w-full rounded bg-slate-100" />
        <div className="h-2 w-4/5 rounded bg-slate-100" />
        <div className="h-2 w-3/5 rounded bg-slate-100" />
      </div>
      {/* Safari bottom bar — share destacado */}
      <div className="bg-slate-100 border-t border-slate-200 px-4 py-2 flex items-center justify-between">
        <div className="h-4 w-4 rounded bg-slate-300" />
        <div className="h-4 w-4 rounded bg-slate-300" />
        {/* Share button em destaque */}
        <div className="relative flex flex-col items-center gap-0.5">
          <div className="absolute -inset-2 rounded-xl bg-blue-100 animate-pulse" />
          <Share className="h-4 w-4 text-blue-600 relative z-10" />
          <div className="absolute -top-5 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-[9px] px-1.5 py-0.5 rounded whitespace-nowrap">
            Toque aqui
          </div>
        </div>
        <div className="h-4 w-4 rounded bg-slate-300" />
        <div className="h-4 w-4 rounded bg-slate-300" />
      </div>
    </PhoneFrame>
  );
}

function AddToHomeMockupIOS() {
  const menuItems = [
    { icon: '✉️', label: 'Mensagem' },
    { icon: '📋', label: 'Copiar link' },
    { icon: '🏠', label: 'Adicionar à Tela de Início', highlight: true },
    { icon: '🔖', label: 'Adicionar aos Favoritos' },
  ];
  return (
    <PhoneFrame>
      <div className="bg-white px-3 py-2 space-y-1" style={{ minHeight: 50 }}>
        <div className="h-2 w-full rounded bg-slate-100" />
        <div className="h-2 w-3/5 rounded bg-slate-100" />
      </div>
      {/* Sheet */}
      <div className="bg-slate-100 rounded-t-2xl px-3 py-2">
        <div className="h-1 w-10 rounded-full bg-slate-300 mx-auto mb-2" />
        {/* Ícones de compartilhamento */}
        <div className="flex gap-3 justify-center mb-3">
          {['📩','💬','📱','📤'].map((e, i) => (
            <div key={i} className="flex flex-col items-center gap-1">
              <div className="h-10 w-10 rounded-full bg-white flex items-center justify-center text-lg shadow-sm">{e}</div>
              <div className="h-1.5 w-7 rounded bg-slate-300" />
            </div>
          ))}
        </div>
        {/* Lista de ações */}
        <div className="bg-white rounded-xl overflow-hidden divide-y divide-slate-100">
          {menuItems.map((item) => (
            <div
              key={item.label}
              className={`flex items-center gap-2 px-3 py-2 ${item.highlight ? 'bg-blue-50' : ''}`}
            >
              <span className="text-base">{item.icon}</span>
              <span className={`text-[11px] ${item.highlight ? 'text-blue-600 font-semibold' : 'text-slate-700'}`}>
                {item.label}
              </span>
              {item.highlight && (
                <div className="ml-auto h-4 w-4 rounded-full bg-blue-500 flex items-center justify-center">
                  <Check className="h-2.5 w-2.5 text-white" />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </PhoneFrame>
  );
}

function ConfirmMockupIOS() {
  return (
    <PhoneFrame>
      <div className="bg-slate-100 px-2 py-1.5">
        <div className="bg-white rounded-lg px-3 py-1 flex items-center gap-1 border border-slate-200">
          <span className="text-[10px] text-slate-400 flex-1">Adicionar à Tela de Início</span>
        </div>
      </div>
      <div className="bg-white px-4 py-4 space-y-3" style={{ minHeight: 140 }}>
        {/* Dialog */}
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center text-xl shadow-sm">🥗</div>
            <div>
              <p className="text-xs font-semibold text-slate-800">WellNutriAI</p>
              <p className="text-[10px] text-slate-400">wellnutriai.com</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Um ícone será adicionado à sua Tela de Início para acesso rápido a este website.
          </p>
        </div>
        {/* Botão Adicionar */}
        <div className="flex justify-end">
          <div className="bg-blue-500 text-white text-xs font-semibold px-4 py-1.5 rounded-lg">
            Adicionar
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

function ChromeMockup() {
  return (
    <PhoneFrame dark>
      {/* Chrome address bar */}
      <div className="bg-slate-800 px-2 py-1.5 flex items-center gap-2">
        <div className="flex-1 bg-slate-700 rounded-lg px-3 py-1 flex items-center gap-1">
          <div className="h-2 w-2 rounded-full bg-green-500" />
          <span className="text-[10px] text-slate-300 flex-1 text-center">wellnutriai.com</span>
        </div>
        <MoreVertical className="h-4 w-4 text-slate-400" />
      </div>
      {/* Page */}
      <div className="bg-white px-3 py-4 space-y-2" style={{ minHeight: 140 }}>
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded bg-green-100" />
          <div className="h-3 w-24 rounded bg-slate-200" />
        </div>
        <div className="h-2 w-full rounded bg-slate-100" />
        <div className="h-2 w-4/5 rounded bg-slate-100" />
        <div className="h-8 w-full rounded-lg bg-green-500 mt-3" />
      </div>
    </PhoneFrame>
  );
}

function ChromeMenuMockup() {
  return (
    <PhoneFrame dark>
      <div className="bg-slate-800 px-2 py-1.5 flex items-center gap-2">
        <div className="flex-1 bg-slate-700 rounded-lg px-3 py-1">
          <span className="text-[10px] text-slate-300">wellnutriai.com</span>
        </div>
        {/* Three dots em destaque */}
        <div className="relative">
          <div className="absolute -inset-1.5 rounded-lg bg-blue-500/30 animate-pulse" />
          <MoreVertical className="h-4 w-4 text-white relative z-10" />
        </div>
      </div>
      <div className="bg-white px-3 py-2 space-y-1.5" style={{ minHeight: 100 }}>
        <div className="h-2 w-full rounded bg-slate-100" />
        <div className="h-2 w-3/5 rounded bg-slate-100" />
      </div>
      {/* Menu dropdown */}
      <div className="bg-white border-t border-slate-100 rounded-b-none">
        {['Nova aba', 'Nova guia anônima', 'Histórico', 'Adicionar à tela inicial'].map((item) => {
          const highlight = item === 'Adicionar à tela inicial';
          return (
            <div
              key={item}
              className={`flex items-center gap-2 px-3 py-2 border-b border-slate-50 ${highlight ? 'bg-green-50' : ''}`}
            >
              <Plus className={`h-3 w-3 ${highlight ? 'text-green-600' : 'text-slate-400'}`} />
              <span className={`text-[11px] ${highlight ? 'text-green-700 font-semibold' : 'text-slate-600'}`}>
                {item}
              </span>
            </div>
          );
        })}
      </div>
    </PhoneFrame>
  );
}

function AddToHomeMockupAndroid() {
  return (
    <PhoneFrame dark>
      <div className="bg-slate-800 px-2 py-1.5 flex items-center gap-2">
        <div className="flex-1 bg-slate-700 rounded-lg px-3 py-1">
          <span className="text-[10px] text-slate-300">wellnutriai.com</span>
        </div>
        <MoreVertical className="h-4 w-4 text-slate-400" />
      </div>
      <div className="bg-white px-3 py-3 space-y-1.5" style={{ minHeight: 90 }}>
        <div className="h-2 w-full rounded bg-slate-100" />
        <div className="h-2 w-4/5 rounded bg-slate-100" />
      </div>
      {/* Banner de instalação Android */}
      <div className="bg-white border-t-2 border-green-500 px-3 py-3 flex items-center gap-3">
        <div className="h-10 w-10 rounded-xl bg-green-100 flex items-center justify-center text-lg">🥗</div>
        <div className="flex-1">
          <p className="text-[11px] font-semibold text-slate-800">WellNutriAI</p>
          <p className="text-[10px] text-slate-400">Adicionar à tela inicial</p>
        </div>
        <div className="bg-green-600 text-white text-[10px] font-bold px-2 py-1 rounded-lg">
          Instalar
        </div>
      </div>
    </PhoneFrame>
  );
}

function ConfirmMockupAndroid() {
  return (
    <PhoneFrame dark>
      <div className="bg-slate-800 px-2 py-1.5 flex items-center gap-2">
        <div className="flex-1 bg-slate-700 rounded-lg px-3 py-1">
          <span className="text-[10px] text-slate-300">wellnutriai.com</span>
        </div>
        <MoreVertical className="h-4 w-4 text-slate-400" />
      </div>
      <div className="bg-white px-3 py-2 space-y-1.5" style={{ minHeight: 70 }}>
        <div className="h-2 w-full rounded bg-slate-100" />
        <div className="h-2 w-3/5 rounded bg-slate-100" />
      </div>
      {/* Dialog de confirmação Android */}
      <div className="bg-black/40 px-4 py-3">
        <div className="bg-white rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 rounded-xl bg-green-100 flex items-center justify-center text-xl">🥗</div>
            <div>
              <p className="text-xs font-semibold text-slate-800">WellNutriAI</p>
              <p className="text-[10px] text-slate-400">wellnutriai.com</p>
            </div>
          </div>
          <p className="text-[10px] text-slate-500 leading-relaxed">
            Adicionar à tela inicial?
          </p>
          <div className="flex justify-end gap-2">
            <span className="text-[11px] text-slate-500 px-3 py-1.5">Cancelar</span>
            <div className="bg-green-600 text-white text-[11px] font-semibold px-3 py-1.5 rounded-lg">
              Adicionar
            </div>
          </div>
        </div>
      </div>
    </PhoneFrame>
  );
}

import type { Config } from 'tailwindcss';

// Ver DESIGN.md na raiz do projeto — fonte da verdade das decisões
// deste token system (redesign visual v2, puramente de apresentação).
const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        // brand.* mantido como alias de primary.* só pra não quebrar
        // nenhum uso residual durante a migração das páginas — remover
        // depois que todo o app estiver convertido (ver TodoWrite).
        brand: {
          50: '#F1F6F2',
          100: '#E3ECE5',
          200: '#C7D9CB',
          500: '#3F6B4C',
          600: '#335A3F',
          700: '#294932',
          900: '#16241A',
        },
        primary: {
          50: '#F1F6F2',
          100: '#E3ECE5',
          200: '#C7D9CB',
          300: '#A0BEA9',
          400: '#6B9478',
          500: '#3F6B4C',
          600: '#335A3F',
          700: '#294932',
          800: '#203824',
          900: '#16241A',
        },
        secondary: {
          DEFAULT: '#211F1A',
          hover: '#33312A',
        },
        background: '#FAF8F3',
        surface: {
          DEFAULT: '#FFFFFF',
          secondary: '#F3F0E9',
        },
        border: {
          DEFAULT: '#E8E3D6',
          hover: '#D8D1BF',
        },
        divider: '#EFEBE0',
        ink: {
          DEFAULT: '#211F1A',
          secondary: '#4A473F',
          muted: '#8A8577',
        },
        success: '#3F6B4C',
        warning: '#B8863A',
        error: '#B24632',
        info: '#3D6B8C',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'Georgia', 'serif'],
      },
      borderRadius: {
        sm: '6px',
        DEFAULT: '10px',
        md: '10px',
        lg: '16px',
        xl: '20px',
      },
      boxShadow: {
        // Tingidas com o tom quente da paleta (ink em baixa opacidade),
        // nunca preto/cinza puro — profundidade sutil, não "flutuando".
        soft: '0 1px 2px rgba(33, 31, 26, 0.04), 0 4px 16px rgba(33, 31, 26, 0.06)',
        'soft-lg': '0 4px 8px rgba(33, 31, 26, 0.04), 0 12px 32px rgba(33, 31, 26, 0.10)',
      },
      transitionTimingFunction: {
        DEFAULT: 'cubic-bezier(0.16, 1, 0.3, 1)',
      },
      transitionDuration: {
        DEFAULT: '200ms',
      },
      animation: {
        'fade-in': 'fadeIn 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
        'slide-up': 'slideUp 0.4s cubic-bezier(0.16, 1, 0.3, 1)',
      },
      keyframes: {
        fadeIn: { '0%': { opacity: '0' }, '100%': { opacity: '1' } },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};

export default config;

import { defineConfig } from 'vitest/config';
import path from 'path';

// Testes unitários, sem I/O real: nunca chamam Supabase, OpenAI, Stripe
// ou Mercado Pago de verdade. Cobrem funções puras extraídas
// especificamente pra isso (ver src/lib/entitlement.ts,
// src/lib/mealPlanSafety.ts, src/lib/consentCheck.ts).
export default defineConfig({
  test: {
    environment: 'node',
    include: ['src/**/__tests__/**/*.test.ts'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
});

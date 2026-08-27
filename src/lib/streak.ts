// Mesmo fuso usado no trigger do banco (ver
// supabase/migrations/028_meal_streak.sql) — precisa bater com o
// servidor pra "hoje" nunca divergir entre onde o streak é gravado e
// onde é exibido.
const STREAK_TIMEZONE = 'America/Sao_Paulo';

function dateKeyInStreakTimezone(date: Date): string {
  // Formato YYYY-MM-DD, direto — locale 'en-CA' é o truque comum pra
  // Intl.DateTimeFormat devolver nessa ordem sem montar a string à mão.
  return new Intl.DateTimeFormat('en-CA', { timeZone: STREAK_TIMEZONE }).format(date);
}

export interface MealStreakState {
  lastMealLoggedDate: string | null; // 'YYYY-MM-DD', como vem de profiles.last_meal_logged_date
  currentStreakDays: number;
}

export interface EffectiveStreak {
  days: number;
  loggedToday: boolean;
}

/**
 * "Efetivo" porque profiles.current_streak_days só é recalculada no
 * PRÓXIMO registro (ver o trigger) — se o usuário parar de registrar,
 * a coluna fica parada no último valor até ele voltar. Esta função
 * decide o que MOSTRAR agora, incluindo o caso em que o streak já
 * quebrou por inatividade mas o banco ainda não sabe disso.
 */
export function getEffectiveStreak(state: MealStreakState, now: Date = new Date()): EffectiveStreak {
  if (!state.lastMealLoggedDate) return { days: 0, loggedToday: false };

  const today = dateKeyInStreakTimezone(now);
  if (state.lastMealLoggedDate === today) {
    return { days: state.currentStreakDays, loggedToday: true };
  }

  // Brasil não observa horário de verão desde 2019 — subtrair 24h em
  // milissegundos sempre cai no dia civil anterior nesse fuso, sem
  // caso especial de DST pra tratar.
  const yesterday = dateKeyInStreakTimezone(new Date(now.getTime() - 24 * 60 * 60 * 1000));
  if (state.lastMealLoggedDate === yesterday) {
    // Ainda não registrou hoje, mas o streak não quebrou — registrar
    // hoje mantém a sequência.
    return { days: state.currentStreakDays, loggedToday: false };
  }

  // Passou mais de 1 dia sem registrar — quebrado, mesmo que o banco
  // ainda mostre o número antigo até o próximo registro.
  return { days: 0, loggedToday: false };
}

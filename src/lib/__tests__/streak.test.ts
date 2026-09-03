import { describe, expect, it } from 'vitest';
import { getEffectiveStreak } from '@/lib/streak';

describe('getEffectiveStreak', () => {
  it('retorna 0 e não-aceso quando nunca registrou nenhuma refeição', () => {
    const result = getEffectiveStreak({ lastMealLoggedDate: null, currentStreakDays: 0 }, new Date('2026-06-15T12:00:00Z'));
    expect(result).toEqual({ days: 0, loggedToday: false });
  });

  it('está aceso quando o último registro foi hoje (fuso America/Sao_Paulo)', () => {
    const result = getEffectiveStreak(
      { lastMealLoggedDate: '2026-06-15', currentStreakDays: 5 },
      new Date('2026-06-15T12:00:00Z'), // meio-dia UTC, ainda dia 15 em SP
    );
    expect(result).toEqual({ days: 5, loggedToday: true });
  });

  it('streak continua vivo (não quebrado) se o último registro foi ontem', () => {
    const result = getEffectiveStreak(
      { lastMealLoggedDate: '2026-06-14', currentStreakDays: 5 },
      new Date('2026-06-15T12:00:00Z'),
    );
    expect(result).toEqual({ days: 5, loggedToday: false });
  });

  it('streak quebrado (0) se ficou 2+ dias sem registrar', () => {
    const result = getEffectiveStreak(
      { lastMealLoggedDate: '2026-06-10', currentStreakDays: 5 },
      new Date('2026-06-15T12:00:00Z'),
    );
    expect(result).toEqual({ days: 0, loggedToday: false });
  });

  it('usa o fuso America/Sao_Paulo, não UTC, para decidir "hoje" perto da virada de meia-noite UTC', () => {
    // 01:00 UTC de 16/jun = 22:00 de 15/jun em São Paulo (UTC-3) — ainda "hoje" é dia 15 lá.
    const now = new Date('2026-06-16T01:00:00Z');
    const result = getEffectiveStreak({ lastMealLoggedDate: '2026-06-15', currentStreakDays: 3 }, now);
    expect(result).toEqual({ days: 3, loggedToday: true });
  });

  it('cálculo de "ontem" também respeita o fuso perto da virada de meia-noite UTC', () => {
    const now = new Date('2026-06-16T01:00:00Z'); // "hoje" em SP = 15/jun
    const result = getEffectiveStreak({ lastMealLoggedDate: '2026-06-14', currentStreakDays: 3 }, now);
    expect(result).toEqual({ days: 3, loggedToday: false });
  });

  it('não fabrica um streak positivo para uma data futura acidental', () => {
    const result = getEffectiveStreak(
      { lastMealLoggedDate: '2026-06-20', currentStreakDays: 5 },
      new Date('2026-06-15T12:00:00Z'),
    );
    expect(result).toEqual({ days: 0, loggedToday: false });
  });
});

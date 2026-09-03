import { describe, expect, it } from 'vitest';
import { calculateNutrition } from '@/lib/nutrition/calculate';

describe('calculateNutrition — critério de aceite do pedido', () => {
  it('150g de arroz branco cozido dá exatamente 192 kcal (128 kcal/100g * 1.5)', () => {
    const result = calculateNutrition([{ tacoId: 'arroz-branco-cozido', gramas: 150 }]);
    expect(result.items[0].kcal).toBe(192);
    expect(result.totals.kcal).toBe(192);
  });

  it('é determinístico — mesma entrada, mesma saída, sempre', () => {
    const input = [{ tacoId: 'arroz-branco-cozido', gramas: 150 }];
    const first = calculateNutrition(input);
    const second = calculateNutrition(input);
    expect(second).toEqual(first);
  });
});

describe('calculateNutrition — regra de três', () => {
  it('100g bate exatamente com os valores por 100g da TACO', () => {
    const result = calculateNutrition([{ tacoId: 'frango-peito-grelhado', gramas: 100 }]);
    const item = result.items[0];
    expect(item.kcal).toBe(159);
    expect(item.proteina_g).toBe(32.0);
    expect(item.carbo_g).toBe(0.0);
    expect(item.gordura_g).toBe(3.0);
  });

  it('50g dá metade dos valores por 100g', () => {
    const result = calculateNutrition([{ tacoId: 'frango-peito-grelhado', gramas: 50 }]);
    const item = result.items[0];
    expect(item.kcal).toBe(80); // round(159 * 0.5) = round(79.5) = 80
    expect(item.proteina_g).toBe(16.0);
  });

  it('soma corretamente os totais de múltiplos itens', () => {
    const result = calculateNutrition([
      { tacoId: 'arroz-branco-cozido', gramas: 150 }, // 192 kcal
      { tacoId: 'frango-peito-grelhado', gramas: 100 }, // 159 kcal
      { tacoId: 'feijao-carioca-cozido', gramas: 80 }, // round(76*0.8)=61 kcal
    ]);
    expect(result.items).toHaveLength(3);
    expect(result.totals.kcal).toBe(192 + 159 + 61);
  });

  it('lista vazia dá totais zerados e nenhum item', () => {
    const result = calculateNutrition([]);
    expect(result.items).toEqual([]);
    expect(result.totals).toEqual({ kcal: 0, proteina_g: 0, carbo_g: 0, gordura_g: 0, fibra_g: 0 });
  });
});

describe('calculateNutrition — nunca fabrica valor para entrada inválida', () => {
  it('lança para tacoId que não existe na base local', () => {
    expect(() => calculateNutrition([{ tacoId: 'alimento-inexistente-xyz', gramas: 100 }])).toThrow(/desconhecido/);
  });

  it('lança para gramas zero, negativo ou não-finito', () => {
    expect(() => calculateNutrition([{ tacoId: 'arroz-branco-cozido', gramas: 0 }])).toThrow(/gramas inválido/);
    expect(() => calculateNutrition([{ tacoId: 'arroz-branco-cozido', gramas: -50 }])).toThrow(/gramas inválido/);
    expect(() => calculateNutrition([{ tacoId: 'arroz-branco-cozido', gramas: NaN }])).toThrow(/gramas inválido/);
  });
});

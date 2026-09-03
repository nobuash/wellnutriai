// Um alimento da Tabela Brasileira de Composição de Alimentos (TACO),
// NEPA/UNICAMP. Valores sempre por 100g da porção EDÍVEL — é assim
// que a TACO publica, e é a convenção que src/lib/nutrition/calculate.ts
// assume ao fazer a regra de três.
export interface TacoFood {
  id: string;
  name: string;
  aliases: string[];
  kcal100g: number;
  protein100g: number;
  carbs100g: number;
  fat100g: number;
  fiber100g: number;
}

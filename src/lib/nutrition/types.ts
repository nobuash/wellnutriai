import { z } from 'zod';

// Saída da extração via LLM — a MESMA forma para o adaptador de texto
// e o de foto, é o que permite os dois alimentarem o mesmo pipeline
// de normalização + cálculo (ver extract-from-text.ts,
// extract-from-photo.ts). Nunca contém caloria/macro — só
// identificação de alimento e porção.
export const extractedFoodItemSchema = z.object({
  alimento: z.string().min(1),
  gramas: z.number().positive(),
  estimado: z.boolean(),
});

export const extractionResponseSchema = z.object({
  items: z.array(extractedFoodItemSchema).max(30),
});

export type ExtractedFoodItem = z.infer<typeof extractedFoodItemSchema>;

export interface ExtractionResult {
  items: ExtractedFoodItem[];
  inputTokens: number;
  outputTokens: number;
}

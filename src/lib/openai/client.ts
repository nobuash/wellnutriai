import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const MODELS = {
  TEXT: 'gpt-4o-mini',
  VISION: 'gpt-4o',
} as const;

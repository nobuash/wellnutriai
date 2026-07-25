import OpenAI from 'openai';

export const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const MODELS = {
  TEXT: 'gpt-4.1-mini',
  VISION: 'gpt-4o',
} as const;

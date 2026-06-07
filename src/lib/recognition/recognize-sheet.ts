import OpenAI from 'openai';
import { RawRecognitionSchema, type RecognitionResult } from './schema';
import { buildRecognitionPrompt } from './prompt';
import { normalizeRecognition } from './normalize';
import type { CatalogEntry } from './match-product';
import type { SheetType } from '@/lib/domain/types';

export type ImageInput =
  | { kind: 'base64'; mediaType: 'image/jpeg' | 'image/png' | 'image/webp'; data: string }
  | { kind: 'url'; url: string };

export type RecognizeSheetInput = {
  image: ImageInput;
  catalog: CatalogEntry[];
  sheetType: SheetType;
};

/**
 * Минимальный контракт клиента (OpenAI-совместимый, как OpenRouter) — для инъекции стаба в тестах.
 */
export type RecognitionClient = {
  chat: {
    completions: {
      create: (args: unknown) => Promise<{ choices: Array<{ message: { content: string | null } }> }>;
    };
  };
};

// Распознавание идёт через OpenRouter (OpenAI-совместимый API). Модель — vision.
const MODEL = 'google/gemini-2.5-flash';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Точная форма JSON для надёжности на любом провайдере (модель транскрибирует, не считает).
const JSON_SHAPE = [
  'Ответь ТОЛЬКО валидным JSON (без markdown-ограждений и текста вокруг) строго такой структуры:',
  '{',
  '  "pointHint": string|null,',
  '  "sheetType": "pies"|"desserts"|"confectionery_freeform",',
  '  "dates": ["YYYY-MM-DD", ...],',
  '  "rows": [{ "productName": string, "cells": [{ "date": "YYYY-MM-DD", "prihod": string|null, "ostatok": string|null, "spisanie": string|null }] }],',
  '  "unknownLines": [{ "rawText": string, "note": string|null }],',
  '  "warnings": [string]',
  '}',
].join('\n');

function imageUrl(image: ImageInput): string {
  return image.kind === 'base64' ? `data:${image.mediaType};base64,${image.data}` : image.url;
}

function defaultClient(): RecognitionClient {
  return new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: process.env.OPENROUTER_API_KEY,
  }) as unknown as RecognitionClient;
}

function stripFences(s: string): string {
  return s
    .replace(/^\s*```(?:json)?\s*/i, '')
    .replace(/\s*```\s*$/i, '')
    .trim();
}

export async function recognizeSheet(
  input: RecognizeSheetInput,
  client: RecognitionClient = defaultClient(),
): Promise<RecognitionResult> {
  const prompt = `${buildRecognitionPrompt(input.catalog, input.sheetType)}\n\n${JSON_SHAPE}`;

  const response = await client.chat.completions.create({
    model: MODEL,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image_url', image_url: { url: imageUrl(input.image) } },
          { type: 'text', text: prompt },
        ],
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error('Recognition: empty response from model');

  // zod-валидация — страховка: при кривом ответе бросает понятную ошибку.
  const raw = RawRecognitionSchema.parse(JSON.parse(stripFences(content)));
  return normalizeRecognition(raw, input.catalog);
}

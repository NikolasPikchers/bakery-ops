import Anthropic from '@anthropic-ai/sdk';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
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

/** Минимальный контракт клиента, который нам нужен (для инъекции стаба в тестах). */
export type RecognitionClient = {
  messages: { parse: (args: unknown) => Promise<{ parsed_output: unknown }> };
};

const MODEL = 'claude-opus-4-8';

function imageBlock(image: ImageInput) {
  if (image.kind === 'base64') {
    return {
      type: 'image' as const,
      source: { type: 'base64' as const, media_type: image.mediaType, data: image.data },
    };
  }
  return { type: 'image' as const, source: { type: 'url' as const, url: image.url } };
}

export async function recognizeSheet(
  input: RecognizeSheetInput,
  client: RecognitionClient = new Anthropic() as unknown as RecognitionClient,
): Promise<RecognitionResult> {
  const prompt = buildRecognitionPrompt(input.catalog, input.sheetType);
  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: 'adaptive' },
    output_config: { format: zodOutputFormat(RawRecognitionSchema) },
    messages: [
      { role: 'user', content: [imageBlock(input.image), { type: 'text', text: prompt }] },
    ],
  });
  // Повторная валидация — страховка: при refusal / max_tokens parsed_output = null,
  // тогда тут бросается понятная ZodError вместо тихого мусора ниже.
  const raw = RawRecognitionSchema.parse(response.parsed_output);
  return normalizeRecognition(raw, input.catalog);
}

export type CatalogEntry = {
  id: string;
  name: string;
  aliases?: string[];
};

export type ProductMatch = { productId: string | null; confidence: number };

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'"“”]/g, '')
    .replace(/[()]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalizeName(s).split(' ').filter(Boolean));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter += 1;
  return inter / (a.size + b.size - inter);
}

export function matchProductToCatalog(
  rawName: string,
  catalog: CatalogEntry[],
  threshold = 0.5,
): ProductMatch {
  const target = normalizeName(rawName);

  for (const p of catalog) {
    const variants = [p.name, ...(p.aliases ?? [])].map(normalizeName);
    if (variants.includes(target)) return { productId: p.id, confidence: 1 };
  }

  const targetTokens = tokenSet(rawName);
  let best: ProductMatch = { productId: null, confidence: 0 };
  for (const p of catalog) {
    let score = 0;
    for (const variant of [p.name, ...(p.aliases ?? [])]) {
      score = Math.max(score, jaccard(targetTokens, tokenSet(variant)));
    }
    if (score > best.confidence) best = { productId: p.id, confidence: score };
  }
  return best.confidence >= threshold ? best : { productId: null, confidence: best.confidence };
}

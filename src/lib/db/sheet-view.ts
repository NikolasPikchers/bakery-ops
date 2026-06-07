import type { PrismaClient } from '@prisma/client';
import type { SheetType } from '@/lib/domain/types';
import { scopeForPoint } from './catalog-repo';

export const LOW_CONFIDENCE = 0.8;

type RawCell = { prihod: string; ostatok: string; spisanie: string };

export type RawSheetData = {
  sheet: {
    id: string;
    pointId: string;
    sheetType: SheetType;
    imageUrl: string;
    dates: Date[];
    status: string;
    point: { name: string };
  };
  movements: Array<{
    productId: string;
    date: Date;
    prihod: number | null;
    ostatok: number | null;
    spisanie: number | null;
    soldCalc: number | null;
    confidence: number | null;
    rawCell: RawCell | null;
    product: { name: string };
  }>;
  unknownLines: Array<{ id: string; rawText: string; status: string; mappedProductId: string | null }>;
  products: Array<{ id: string; name: string }>;
};

export type ViewCell = {
  prihod: number | null;
  ostatok: number | null;
  spisanie: number | null;
  soldCalc: number | null;
  confidence: number | null;
  raw: RawCell | null;
  low: boolean;
};
export type ViewRow = {
  productId: string;
  productName: string;
  cells: Record<string, ViewCell>;
};
export type SheetView = {
  sheetId: string;
  pointId: string;
  pointName: string;
  sheetType: SheetType;
  imageUrl: string;
  status: string;
  dates: string[];
  rows: ViewRow[];
  unknownLines: RawSheetData['unknownLines'];
  products: RawSheetData['products'];
};

const iso = (d: Date) => d.toISOString().slice(0, 10);

/** Чистый pivot: движения → строки товаров × колонки дат. */
export function buildSheetView(data: RawSheetData): SheetView {
  const dates = data.sheet.dates.map(iso).sort();
  const byProduct = new Map<string, ViewRow>();
  for (const m of data.movements) {
    let row = byProduct.get(m.productId);
    if (!row) {
      row = { productId: m.productId, productName: m.product.name, cells: {} };
      byProduct.set(m.productId, row);
    }
    const conf = m.confidence ?? 1;
    row.cells[iso(m.date)] = {
      prihod: m.prihod,
      ostatok: m.ostatok,
      spisanie: m.spisanie,
      soldCalc: m.soldCalc,
      confidence: m.confidence,
      raw: m.rawCell,
      low: conf < LOW_CONFIDENCE,
    };
  }
  const rows = [...byProduct.values()].sort((a, b) => a.productName.localeCompare(b.productName));
  return {
    sheetId: data.sheet.id,
    pointId: data.sheet.pointId,
    pointName: data.sheet.point.name,
    sheetType: data.sheet.sheetType,
    imageUrl: data.sheet.imageUrl,
    status: data.sheet.status,
    dates,
    rows,
    unknownLines: data.unknownLines,
    products: data.products,
  };
}

/** Загрузка из БД + pivot. Возвращает null, если листа нет. */
export async function loadSheetView(prisma: PrismaClient, sheetId: string): Promise<SheetView | null> {
  const sheet = await prisma.sheet.findUnique({
    where: { id: sheetId },
    include: { point: { select: { name: true } } },
  });
  if (!sheet) return null;

  const [movements, unknownLines, products] = await Promise.all([
    prisma.movement.findMany({
      where: { sheetId },
      include: { product: { select: { name: true } } },
      orderBy: [{ productId: 'asc' }, { date: 'asc' }],
    }),
    prisma.unknownLine.findMany({
      where: { sheetId },
      select: { id: true, rawText: true, status: true, mappedProductId: true },
    }),
    prisma.product.findMany({
      where: {
        active: true,
        sheetType: sheet.sheetType,
        pointScope: { in: ['both', scopeForPoint(sheet.pointId)] },
      },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
  ]);

  return buildSheetView({
    sheet: {
      id: sheet.id,
      pointId: sheet.pointId,
      sheetType: sheet.sheetType,
      imageUrl: sheet.imageUrl,
      dates: sheet.dates,
      status: sheet.status,
      point: { name: sheet.point.name },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    movements: movements.map((m: any) => ({
      productId: m.productId,
      date: m.date,
      prihod: m.prihod,
      ostatok: m.ostatok,
      spisanie: m.spisanie,
      soldCalc: m.soldCalc,
      confidence: m.confidence,
      rawCell: m.rawCell as RawCell | null,
      product: { name: m.product.name },
    })),
    unknownLines,
    products,
  });
}

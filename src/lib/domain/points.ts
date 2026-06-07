export const POINTS = [
  { id: 'point-1', name: 'Плюшкино' },
  { id: 'point-2', name: 'Корица' },
] as const;

export type PointId = (typeof POINTS)[number]['id'];

export function pointName(id: string): string {
  return POINTS.find((p) => p.id === id)?.name ?? id;
}

/** Резолвит точку по id ('point-1') или имени ('Плюшкино'/'Корица'), регистронезависимо. */
export function pointIdFromInput(s: string): PointId | null {
  const t = s.trim().toLowerCase();
  const byId = POINTS.find((p) => p.id.toLowerCase() === t);
  if (byId) return byId.id;
  const byName = POINTS.find((p) => p.name.toLowerCase() === t);
  return byName ? byName.id : null;
}

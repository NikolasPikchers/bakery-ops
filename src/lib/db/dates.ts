/** ISO 'YYYY-MM-DD' → Date в UTC-полночь (совпадает с конвенцией computeAging). */
export function toDbDate(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

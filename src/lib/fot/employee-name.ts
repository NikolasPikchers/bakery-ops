export const MAX_EMPLOYEE_NAME_LENGTH = 100;

export const normalizeEmployeeName = (name: string) => name.normalize('NFC').replace(/\s+/gu, ' ').trim();

export function isValidEmployeeName(name: string): boolean {
  const normalized = normalizeEmployeeName(name);
  return normalized.length > 0 && normalized.length <= MAX_EMPLOYEE_NAME_LENGTH && !/[\u0000-\u001f\u007f]/u.test(normalized);
}

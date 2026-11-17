// Клиент T-API (Т-Бизнес). Токен привязан к IP сервера, поэтому ходить в банк может только прод.
// Сырые операции не нормализуем здесь: соответствие полям выписки-файла — в api-operation.ts.
import { rootCertificates } from 'node:tls';
import { httpsFetch } from './https-fetch';
import { RUSSIAN_TRUSTED_ROOT_CA, RUSSIAN_TRUSTED_SUB_CA } from './russian-ca';

export type TbankAccount = { accountNumber: string; name?: string | null; currency?: string | null; accountType?: string | null };

/** Операция из GET /api/v1/statement. Известные поля типизированы, остальное — как пришло. */
export type TbankRawOperation = {
  operationId?: string;
  operationDate?: string;
  typeOfOperation?: string; // Debit | Credit
  accountAmount?: number;
  operationAmount?: number;
  rubleAmount?: number;
  payPurpose?: string | null;
  description?: string | null;
  documentNumber?: string | null;
  counterParty?: { name?: string | null; inn?: string | null; account?: string | null } | null;
  [key: string]: unknown;
};

export type TBusinessConfig = { token: string; baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch };

const PAGE_LIMIT = 1000;
const MAX_PAGES = 200;

/** Дата (ГГГГ-ММ-ДД) по Москве из ISO-даты или даты-времени банка. */
export function moscowDate(value: string): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Moscow' }).format(new Date(value));
}

export class TBusinessClient {
  private readonly baseUrl: string;
  private readonly fetchImpl: typeof fetch;
  private readonly timeoutMs: number;

  constructor(private readonly config: TBusinessConfig) {
    this.baseUrl = (config.baseUrl ?? 'https://business.tbank.ru/openapi').replace(/\/$/, '');
    // Сертификат T-API может быть выпущен НУЦ Минцифры — доверяем ему только здесь.
    this.fetchImpl = config.fetchImpl ?? httpsFetch([...rootCertificates, RUSSIAN_TRUSTED_ROOT_CA, RUSSIAN_TRUSTED_SUB_CA]);
    this.timeoutMs = config.timeoutMs ?? 30_000;
  }

  private async get<T>(path: string, query?: Record<string, string>): Promise<T> {
    const url = new URL(this.baseUrl + path);
    for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, v);
    let res: Response;
    try {
      res = await this.fetchImpl(url.toString(), {
        method: 'GET',
        headers: { Authorization: `Bearer ${this.config.token}`, Accept: 'application/json' },
        signal: AbortSignal.timeout(this.timeoutMs),
      });
    } catch (e) {
      // «fetch failed» без причины не объясняет ничего: достаём код и текст из cause.
      const err = e as Error & { code?: string; cause?: { code?: string; message?: string } };
      const code = err.cause?.code ?? err.code ?? err.name;
      throw new Error(`T-API ${path}: сеть — ${code}: ${err.cause?.message ?? err.message}`);
    }
    if (!res.ok) {
      const text = (await res.text().catch(() => '')).slice(0, 500);
      throw new Error(`T-API ${path} → HTTP ${res.status}: ${text}`);
    }
    return (await res.json()) as T;
  }

  getAccounts(): Promise<TbankAccount[]> {
    return this.get<TbankAccount[]>('/api/v4/bank-accounts');
  }

  /**
   * Проведённые операции по счёту за [from; till] (даты по Москве, включительно), все страницы.
   * Останавливается и на пустой странице, и на повторе курсора — на случай, если банк отдаёт
   * nextCursor и после последней страницы.
   */
  async getStatement(accountNumber: string, from: string, till: string, onPage?: (operations: number) => void): Promise<TbankRawOperation[]> {
    const all: TbankRawOperation[] = [];
    let cursor: string | null = null;
    for (let page = 0; page < MAX_PAGES; page++) {
      const query: Record<string, string> = {
        accountNumber,
        from: `${from}T00:00:00+03:00`,
        to: `${till}T23:59:59+03:00`,
        operationStatus: 'Transaction',
        limit: String(PAGE_LIMIT),
      };
      if (cursor) query.cursor = cursor;
      const body = await this.get<{ operations?: TbankRawOperation[]; nextCursor?: string | null }>('/api/v1/statement', query);
      const operations = body.operations ?? [];
      all.push(...operations);
      onPage?.(operations.length);
      const next = body.nextCursor ?? null;
      if (!next || operations.length === 0 || next === cursor) return all;
      cursor = next;
    }
    throw new Error(`T-API: выписка больше ${MAX_PAGES} страниц — проверьте период`);
  }
}

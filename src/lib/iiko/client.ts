import { isConfectionery } from './dish-kind';
import { aggregateDishSales, DISH_AGGREGATES, DISH_ROW_FIELDS } from './dish-sales';
import type { DailyRevenue, DishSaleDay, IikoOrg } from './types';

/** Ключи iikoCloud API: appId и clientSecret — с портала разработчика (api.iiko.help), apiKey — из iikoWeb. */
export type IikoAuth = { appId: string; apiKey: string; clientSecret: string };

export type IikoConfig = { auth: IikoAuth; baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch };

export type OlapColumn = { name: string; displayName?: string; type?: string };

const DEFAULT_BASE = 'https://api-ru.iiko.services';
// Поля OLAP SALES сверены с /api/reporting/v1/olap/columns/get (ноябрь 2026).
const DATE_FIELD = 'OpenDate.Typed'; // «Учетный день»
const DISH_FIELD = 'DishName'; // «Блюдо»
const REVENUE_FIELD = 'DishDiscountSumInt'; // «Сумма со скидкой» — совпадает с «Суммой продажи» в xlsx-выгрузках
/** iiko ограничивает период CUSTOM в OLAP 31 днём включительно. */
const MAX_OLAP_DAYS = 31;

const DAY_MS = 86_400_000;
const toMs = (iso: string) => Date.parse(`${iso}T00:00:00.000Z`);
const toIso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const round2 = (n: number) => Math.round(n * 100) / 100;

/** Период [from; till] включительно → отрезки не длиннее maxDays дней. */
export function splitRange(from: string, till: string, maxDays = MAX_OLAP_DAYS): { from: string; till: string }[] {
  const out: { from: string; till: string }[] = [];
  const end = toMs(till);
  for (let start = toMs(from); start <= end; start += maxDays * DAY_MS) {
    out.push({ from: toIso(start), till: toIso(Math.min(start + (maxDays - 1) * DAY_MS, end)) });
  }
  return out;
}

/** Строки OLAP «день × блюдо» → выручка по дням (с кондитеркой), по возрастанию даты. */
export function aggregateDailySales(rows: Record<string, unknown>[]): DailyRevenue[] {
  const byDay = new Map<string, { amount: number; confectionery: number }>();
  for (const r of rows) {
    const date = String(r[DATE_FIELD] ?? '').slice(0, 10);
    if (!date) continue;
    const sum = Number(r[REVENUE_FIELD] ?? 0) || 0;
    const day = byDay.get(date) ?? { amount: 0, confectionery: 0 };
    day.amount += sum;
    if (isConfectionery(String(r[DISH_FIELD] ?? ''))) day.confectionery += sum;
    byDay.set(date, day);
  }
  return [...byDay.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, d]) => ({ date, amount: round2(d.amount), confectionery: round2(d.confectionery) }));
}

export class IikoClient {
  private auth: IikoAuth;
  private baseUrl: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;
  private token: string | null = null;

  constructor(cfg: IikoConfig) {
    this.auth = cfg.auth;
    this.baseUrl = cfg.baseUrl ?? DEFAULT_BASE;
    this.timeoutMs = cfg.timeoutMs ?? 45_000;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private async post(path: string, body: unknown, auth = true): Promise<unknown> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth) {
        headers.Authorization = `Bearer ${await this.getToken()}`;
        // Сколько iiko ждёт свой сервер (по умолчанию 15 с) — чуть меньше нашего таймаута.
        headers.Timeout = String(Math.max(1, Math.floor(this.timeoutMs / 1000) - 5));
      }
      const res = await this.fetchImpl(this.baseUrl + path, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
      if (!res.ok) throw new Error(`iiko ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const data = (await this.post('/api/v2/access_token', { appId: this.auth.appId, apiKey: this.auth.apiKey, clientSecret: this.auth.clientSecret }, false)) as {
      token?: string;
    };
    if (!data?.token) throw new Error('iiko: токен не получен');
    this.token = data.token;
    return data.token;
  }

  /** Организации, к которым даёт доступ apiKey. */
  async getOrganizations(): Promise<IikoOrg[]> {
    const data = (await this.post('/api/1/organizations', { returnAdditionalInfo: false, includeDisabled: true })) as { organizations?: Record<string, unknown>[] };
    return (data.organizations ?? []).map((o) => ({ id: String(o.id ?? ''), name: String(o.name ?? '') }));
  }

  /** OLAP SALES за [from; till] (≤ 31 дня) без удалённых заказов и блюд. */
  private async salesOlap(from: string, till: string, rowFields: readonly string[], aggregates: readonly string[]): Promise<Record<string, unknown>[]> {
    const data = (await this.post('/api/reporting/v1/olap/get', {
      reportType: 'SALES',
      buildSummary: false,
      groupByRowFields: rowFields,
      groupByColFields: [],
      aggregateFields: aggregates,
      filters: [
        { name: DATE_FIELD, filterType: 'DateRange', periodType: 'CUSTOM', from, to: till, includeLow: true, includeHigh: true },
        { name: 'OrderDeleted', filterType: 'IncludeValues', values: ['NOT_DELETED'] },
        { name: 'DeletedWithWriteoff', filterType: 'IncludeValues', values: ['NOT_DELETED'] },
      ],
    })) as { data?: Record<string, unknown>[] };
    return data.data ?? [];
  }

  /** Выручка по учётным дням [from; till] включительно (без удалённых заказов и блюд). */
  async getDailySales(from: string, till: string): Promise<DailyRevenue[]> {
    const out: DailyRevenue[] = [];
    for (const part of splitRange(from, till)) {
      out.push(...aggregateDailySales(await this.salesOlap(part.from, part.till, [DATE_FIELD, DISH_FIELD], [REVENUE_FIELD])));
    }
    return out;
  }

  /** Продажи по позициям за учётные дни [from; till]: штуки, выручка, себестоимость, чеки. */
  async getDishSales(from: string, till: string): Promise<DishSaleDay[]> {
    const out: DishSaleDay[] = [];
    for (const part of splitRange(from, till)) {
      out.push(...aggregateDishSales(await this.salesOlap(part.from, part.till, DISH_ROW_FIELDS, DISH_AGGREGATES)));
    }
    return out;
  }

  /** Поля OLAP SALES — для --debug, когда iiko поменяет набор полей. */
  async getOlapColumns(): Promise<OlapColumn[]> {
    return (await this.post('/api/reporting/v1/olap/columns/get', { reportType: 'SALES' })) as OlapColumn[];
  }
}

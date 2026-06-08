import type { DailyRevenue, IikoOrg } from './types';

export type IikoAuth =
  | { mode: 'apiLogin'; apiLogin: string }
  | { mode: 'app'; appId: string; apiKey: string; clientSecret: string };

export type IikoConfig = { auth: IikoAuth; baseUrl?: string; timeoutMs?: number; fetchImpl?: typeof fetch };

// ⚠️ ADJUST ON FIRST REAL RESPONSE: host / пути / имена полей OLAP.
const DEFAULT_BASE = 'https://api-ru.iiko.services';
const OLAP_REVENUE_FIELD = 'DishDiscountSumInt'; // нетто-выручка после скидок
const OLAP_DATE_FIELD = 'OpenDate.Typed';

export class IikoClient {
  private auth: IikoAuth;
  private baseUrl: string;
  private timeoutMs: number;
  private fetchImpl: typeof fetch;
  private token: string | null = null;

  constructor(cfg: IikoConfig) {
    this.auth = cfg.auth;
    this.baseUrl = cfg.baseUrl ?? DEFAULT_BASE;
    this.timeoutMs = cfg.timeoutMs ?? 30_000;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private async post(path: string, body: unknown, auth = true): Promise<Record<string, unknown>> {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), this.timeoutMs);
    try {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (auth) headers.Authorization = `Bearer ${await this.getToken()}`;
      const res = await this.fetchImpl(this.baseUrl + path, { method: 'POST', headers, body: JSON.stringify(body), signal: ac.signal });
      if (!res.ok) throw new Error(`iiko ${path} → HTTP ${res.status}: ${(await res.text()).slice(0, 200)}`);
      return (await res.json()) as Record<string, unknown>;
    } finally {
      clearTimeout(timer);
    }
  }

  private async getToken(): Promise<string> {
    if (this.token) return this.token;
    const [path, body]: [string, Record<string, string>] =
      this.auth.mode === 'apiLogin'
        ? ['/api/1/access_token', { apiLogin: this.auth.apiLogin }]
        : ['/api/v2/access_token', { appId: this.auth.appId, apiKey: this.auth.apiKey, clientSecret: this.auth.clientSecret }];
    const data = await this.post(path, body, false);
    const token = data.token as string | undefined;
    if (!token) throw new Error('iiko: токен не получен');
    this.token = token;
    return token;
  }

  async getOrganizations(): Promise<IikoOrg[]> {
    const data = await this.post('/api/1/organizations', { returnAdditionalInfo: false, includeDisabled: true });
    const orgs = (data.organizations ?? []) as Record<string, unknown>[];
    return orgs.map((o) => ({ id: String(o.id ?? ''), name: String(o.name ?? '') }));
  }

  private olapBody(orgId: string, from: string, till: string) {
    // ⚠️ ADJUST ON FIRST REAL RESPONSE
    return {
      organizationId: orgId,
      reportType: 'SALES',
      buildSummary: false,
      groupByRowFields: [OLAP_DATE_FIELD],
      groupByColFields: [],
      aggregateFields: [OLAP_REVENUE_FIELD],
      filters: { [OLAP_DATE_FIELD]: { filterType: 'DateRange', periodType: 'CUSTOM', from, to: till } },
    };
  }

  async getOlapSales(orgId: string, from: string, till: string): Promise<DailyRevenue[]> {
    const data = await this.post('/api/1/reports/olap', this.olapBody(orgId, from, till));
    const rows = (data.data ?? []) as Record<string, unknown>[];
    return rows.map((r) => ({
      date: String(r[OLAP_DATE_FIELD] ?? '').slice(0, 10),
      amount: Number(r[OLAP_REVENUE_FIELD] ?? 0) || 0,
    }));
  }

  /** Для --debug: список колонок OLAP SALES (финализация полей на первом прогоне). */
  async getOlapColumns(): Promise<Record<string, unknown>> {
    return this.post('/api/1/reports/olap/columns/SALES', {});
  }
}

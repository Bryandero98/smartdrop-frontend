import { backendApiUrl } from "@/config";

export class BackendApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = "BackendApiError";
    this.status = status;
    this.code = code;
  }
}

/**
 * Whether a failed backend-API query is worth an automatic retry (#96).
 *
 * A `BackendApiError` with a 4xx status is a deterministic rejection of
 * *this* request — e.g. an invalid Alerts API key (401/403) or a malformed
 * request (400) — retrying it can't succeed and just delays the user
 * seeing the real problem. A 5xx status, or any error that isn't a
 * `BackendApiError` at all (network failure, CORS preflight hiccup, DNS
 * blip — request()'s fetch() call has no try/catch around it, so these
 * surface as whatever error fetch() itself throws), is exactly the
 * transient case worth retrying.
 */
export function isRetryableBackendError(error: unknown): boolean {
  if (error instanceof BackendApiError) {
    return error.status >= 500;
  }
  return true;
}

/**
 * Shared TanStack Query retry policy for the backend-API pages (Prices,
 * Airdrops, Webhooks, Alerts) — bounded retries with exponential backoff
 * for transient failures only, matching the pattern already used for
 * Soroban queries in useSorobanQuery.ts (retry: 2/3 with backoff), gated
 * by isRetryableBackendError so a deterministic 4xx never auto-retries.
 * Spread into a useQuery(...) call: `useQuery({ ...backendQueryRetry, ... })`.
 */
export const backendQueryRetry = {
  retry: (failureCount: number, error: unknown) =>
    failureCount < 2 && isRetryableBackendError(error),
  retryDelay: (attemptIndex: number) => Math.min(1000 * 2 ** attemptIndex, 10_000),
} as const;

async function request<T>(
  path: string,
  init?: RequestInit & { apiKey?: string },
): Promise<T> {
  const { apiKey, ...rest } = init ?? {};
  const headers = new Headers(rest.headers);
  headers.set("Content-Type", "application/json");
  if (apiKey) headers.set("Authorization", `Bearer ${apiKey}`);

  const res = await fetch(`${backendApiUrl}${path}`, { ...rest, headers });
  const body = await res.json().catch(() => null);

  if (!res.ok) {
    const message =
      body?.error?.message ?? body?.error ?? `Request failed with status ${res.status}`;
    throw new BackendApiError(message, res.status, body?.error?.code);
  }

  return body as T;
}

// ---------- Prices ----------

export type PriceResponse = {
  asset_code: string;
  issuer: string | null;
  price_usd: number | null;
  source: string;
  fetched_at: string;
  is_stale: boolean;
  stale_warning: string | null;
  sources_attempted: string[];
  redis_unavailable: boolean;
};

export function getPrice(assetCode: string, issuer?: string): Promise<PriceResponse> {
  const query = issuer ? `?issuer=${encodeURIComponent(issuer)}` : "";
  return request<PriceResponse>(`/prices/${encodeURIComponent(assetCode)}${query}`);
}

// ---------- Airdrops ----------

export type Airdrop = {
  id: string;
  name: string;
  asset: string;
  asset_issuer: string;
  total_amount: number;
  expiry_ledger: number;
  status: string;
  created_at: string;
  updated_at: string;
};

export type Pagination = {
  page: number;
  limit: number;
  total: number;
  total_pages: number;
};

export function listAirdrops(page = 1, limit = 20): Promise<{ airdrops: Airdrop[]; pagination: Pagination }> {
  return request(`/airdrops?page=${page}&limit=${limit}`);
}

export function getAirdrop(id: string): Promise<Airdrop> {
  return request(`/airdrops/${encodeURIComponent(id)}`);
}

export type Recipient = {
  address: string;
  amount: number;
  claimed?: boolean;
};

export function listAirdropRecipients(
  id: string,
  page = 1,
  limit = 20,
): Promise<{ recipients: Recipient[]; pagination: Pagination }> {
  return request(`/airdrops/${encodeURIComponent(id)}/recipients?page=${page}&limit=${limit}`);
}

// ---------- Webhooks ----------

export type Webhook = {
  id: string;
  url: string;
  events: string[];
  active: boolean;
  description: string | null;
  created_at: string;
  updated_at: string;
  secret_preview: string | null;
};

export const WEBHOOK_EVENTS = [
  "pool.created",
  "pool.assets_locked",
  "pool.assets_unlocked",
  "pool.rewards_distributed",
  "pool.closed",
  "price.alert",
] as const;

export function listWebhooks(): Promise<{ webhooks: Webhook[] }> {
  return request(`/webhooks`);
}

export function createWebhook(input: {
  url: string;
  events: string[];
  description?: string;
}): Promise<Webhook> {
  return request(`/webhooks`, { method: "POST", body: JSON.stringify(input) });
}

export function deleteWebhook(id: string): Promise<{ deleted: boolean }> {
  return request(`/webhooks/${encodeURIComponent(id)}`, { method: "DELETE" });
}

export function testWebhook(id: string): Promise<{ delivery: { id: string; status?: string } }> {
  return request(`/webhooks/${encodeURIComponent(id)}/test`, { method: "POST" });
}

// ---------- Alerts (require an API key) ----------

export type Alert = {
  id: string;
  asset: string;
  type: "above" | "below" | "change_pct";
  threshold_usd: number;
  webhook_url: string;
  repeat: boolean;
  created_at: string;
  last_fired_at: string | null;
};

export function listAlerts(apiKey: string, page = 1, limit = 20): Promise<{ data: Alert[]; pagination: Pagination }> {
  return request(`/alerts?page=${page}&limit=${limit}`, { apiKey });
}

export function createAlert(
  apiKey: string,
  input: {
    asset: string;
    type: "above" | "below" | "change_pct";
    threshold_usd: number;
    webhook_url: string;
    webhook_secret: string;
    repeat?: boolean;
  },
): Promise<Alert> {
  return request(`/alerts`, { method: "POST", body: JSON.stringify(input), apiKey });
}

export function deleteAlert(apiKey: string, id: string): Promise<{ deleted: boolean }> {
  return request(`/alerts/${encodeURIComponent(id)}`, { method: "DELETE", apiKey });
}

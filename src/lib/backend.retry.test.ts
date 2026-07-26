import { describe, expect, it } from "vitest";
import { BackendApiError, isRetryableBackendError, backendQueryRetry } from "./backend";

describe("isRetryableBackendError", () => {
  it("does not retry a 400 (bad request)", () => {
    expect(isRetryableBackendError(new BackendApiError("bad request", 400))).toBe(false);
  });

  it("does not retry a 401 (invalid API key — the Alerts page case)", () => {
    expect(isRetryableBackendError(new BackendApiError("invalid API key", 401))).toBe(false);
  });

  it("does not retry a 403 (forbidden)", () => {
    expect(isRetryableBackendError(new BackendApiError("forbidden", 403))).toBe(false);
  });

  it("does not retry a 404 (not found)", () => {
    expect(isRetryableBackendError(new BackendApiError("not found", 404))).toBe(false);
  });

  it("retries a 500 (server error)", () => {
    expect(isRetryableBackendError(new BackendApiError("server error", 500))).toBe(true);
  });

  it("retries a 503 (service unavailable)", () => {
    expect(isRetryableBackendError(new BackendApiError("unavailable", 503))).toBe(true);
  });

  it("retries a plain network failure (not a BackendApiError at all)", () => {
    expect(isRetryableBackendError(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("retries an unknown/non-Error thrown value", () => {
    expect(isRetryableBackendError("some string")).toBe(true);
  });
});

describe("backendQueryRetry", () => {
  it("stops after 2 retries even for a retryable error", () => {
    const networkError = new TypeError("Failed to fetch");
    expect(backendQueryRetry.retry(0, networkError)).toBe(true);
    expect(backendQueryRetry.retry(1, networkError)).toBe(true);
    expect(backendQueryRetry.retry(2, networkError)).toBe(false);
  });

  it("never retries a 4xx BackendApiError, regardless of failure count", () => {
    const authError = new BackendApiError("invalid API key", 401);
    expect(backendQueryRetry.retry(0, authError)).toBe(false);
    expect(backendQueryRetry.retry(1, authError)).toBe(false);
  });

  it("produces an increasing, bounded backoff delay", () => {
    expect(backendQueryRetry.retryDelay(0)).toBe(1000);
    expect(backendQueryRetry.retryDelay(1)).toBe(2000);
    expect(backendQueryRetry.retryDelay(2)).toBe(4000);
    expect(backendQueryRetry.retryDelay(10)).toBe(10_000); // capped
  });
});

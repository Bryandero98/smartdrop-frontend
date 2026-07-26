import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendApiError } from "@/lib/backend";
import AirdropsPage from "./page";

vi.mock("@/lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/backend")>();
  return { ...actual, listAirdrops: vi.fn() };
});

const { listAirdrops } = await import("@/lib/backend");
const listAirdropsMock = vi.mocked(listAirdrops);

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <ChakraProvider>
      <QueryClientProvider client={queryClient}>
        <AirdropsPage />
      </QueryClientProvider>
    </ChakraProvider>,
  );
}

const successData = {
  airdrops: [
    {
      id: "a1",
      name: "Genesis Drop",
      asset: "XLM",
      asset_issuer: "",
      total_amount: 1000,
      expiry_ledger: 123456,
      status: "completed",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-01T00:00:00Z",
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
};

describe("AirdropsPage retry affordance (#96)", () => {
  let reloadSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    listAirdropsMock.mockReset();
    reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("shows a Retry button on failure, and clicking it recovers the page without a reload", async () => {
    // A 4xx settles immediately (no auto-retry, per backendQueryRetry),
    // isolating this test to the manual-click path specifically.
    listAirdropsMock
      .mockRejectedValueOnce(new BackendApiError("Bad request", 400))
      .mockResolvedValueOnce(successData);

    renderPage();

    const retryButton = await screen.findByRole("button", { name: /retry/i });
    expect(screen.getByText("Bad request")).toBeTruthy();

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText("Genesis Drop")).toBeTruthy();
    });

    expect(listAirdropsMock).toHaveBeenCalledTimes(2);
    expect(reloadSpy).not.toHaveBeenCalled();
  });

  it("auto-retries a 5xx failure a bounded number of times without any user action", async () => {
    vi.useFakeTimers();
    listAirdropsMock
      .mockRejectedValueOnce(new BackendApiError("Server error", 500))
      .mockResolvedValueOnce(successData);

    renderPage();

    // First attempt happens synchronously on mount.
    await vi.advanceTimersByTimeAsync(0);
    expect(listAirdropsMock).toHaveBeenCalledTimes(1);

    // backendQueryRetry's first backoff delay is 1000ms.
    await vi.advanceTimersByTimeAsync(1000);

    await vi.waitFor(() => {
      expect(listAirdropsMock).toHaveBeenCalledTimes(2);
    });
  });
});

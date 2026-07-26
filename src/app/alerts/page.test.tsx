import { render, screen, waitFor, fireEvent } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { BackendApiError } from "@/lib/backend";
import AlertsPage from "./page";

vi.mock("@/lib/backend", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/backend")>();
  return { ...actual, listAlerts: vi.fn() };
});

const { listAlerts } = await import("@/lib/backend");
const listAlertsMock = vi.mocked(listAlerts);

function renderPage() {
  const queryClient = new QueryClient();
  return render(
    <ChakraProvider>
      <QueryClientProvider client={queryClient}>
        <AlertsPage />
      </QueryClientProvider>
    </ChakraProvider>,
  );
}

// Synchronous on purpose: the input is unconditionally present from the
// first render, so an async findBy* query (which polls via setTimeout)
// would otherwise hang under fake timers unless manually pumped.
function enterApiKey(key: string) {
  const input = screen.getByPlaceholderText(/smartdrop-backend api key/i);
  fireEvent.change(input, { target: { value: key } });
}

const successData = {
  data: [
    {
      id: "al1",
      asset: "XLM",
      type: "above" as const,
      threshold_usd: 0.2,
      webhook_url: "https://example.com/hook",
      repeat: false,
      created_at: "2024-01-01T00:00:00Z",
      last_fired_at: null,
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, total_pages: 1 },
};

describe("AlertsPage retry affordance (#96)", () => {
  beforeEach(() => {
    listAlertsMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("does NOT auto-retry an invalid API key (401) — only one call within the retry window", async () => {
    vi.useFakeTimers();
    listAlertsMock.mockRejectedValue(new BackendApiError("Invalid API key", 401));

    renderPage();
    enterApiKey("bad-key");

    // Flush the initial query attempt.
    await vi.advanceTimersByTimeAsync(0);
    expect(listAlertsMock).toHaveBeenCalledTimes(1);

    // Advance well past both backoff windows (1000ms, 2000ms) a retryable
    // error would have used — call count must stay at 1.
    await vi.advanceTimersByTimeAsync(5000);

    expect(listAlertsMock).toHaveBeenCalledTimes(1);
  });

  it("shows a Retry button on failure, and clicking it recovers without a reload", async () => {
    const reloadSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, reload: reloadSpy },
      writable: true,
    });

    listAlertsMock
      .mockRejectedValueOnce(new BackendApiError("Invalid API key", 401))
      .mockResolvedValueOnce(successData);

    renderPage();
    enterApiKey("some-key");

    const retryButton = await screen.findByRole("button", { name: /retry/i });
    expect(screen.getByText("Invalid API key")).toBeTruthy();

    fireEvent.click(retryButton);

    await waitFor(() => {
      expect(screen.getByText(/threshold \$0\.2/)).toBeTruthy();
    });

    expect(listAlertsMock).toHaveBeenCalledTimes(2);
    expect(reloadSpy).not.toHaveBeenCalled();
  });
});

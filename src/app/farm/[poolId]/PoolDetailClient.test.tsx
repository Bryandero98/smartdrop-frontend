import { act, render, screen, waitFor } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { sorobanService } from "@/lib/soroban";
import type { PoolInfo } from "@/lib/soroban-parsers";
import { usePools } from "@/hooks/useSorobanQuery";
import PoolDetailClient from "./PoolDetailClient";

vi.mock("@/components/TvlChart/TvlChart", () => ({
  default: () => null,
}));

vi.mock("@/hooks/useLockFlow", () => ({
  useLockFlow: vi.fn(() => ({
    step: "idle",
    record: null,
    error: null,
    isPending: false,
    execute: vi.fn(),
    reset: vi.fn(),
  })),
}));

vi.mock("@/context/StellarWalletContext", () => ({
  useStellarWallet: vi.fn(() => ({
    publicKey: null,
    walletApi: null,
    isConnected: false,
    isNetworkMismatch: false,
  })),
}));

vi.mock("@/context/OwnConnectButtonContext", () => ({
  useOwnConnectButton: vi.fn(() => vi.fn()),
}));

function makePool(overrides: Partial<PoolInfo> = {}): PoolInfo {
  return {
    id: "pool-xlm",
    contractAddress: "CPOOL",
    asset: { code: "XLM", isNative: true },
    dailyRate: "0.5%",
    minLockPeriod: 604800,
    totalLocked: "10000",
    totalUsers: 42,
    isActive: true,
    createdAt: Date.now(),
    ...overrides,
  };
}

function renderDetail(poolId: string, client: QueryClient) {
  return render(
    <ChakraProvider>
      <QueryClientProvider client={client}>
        <PoolDetailClient poolId={poolId} />
      </QueryClientProvider>
    </ChakraProvider>,
  );
}

beforeEach(() => {
  vi.spyOn(sorobanService, "getPoolDepositors").mockResolvedValue([]);

  // jsdom has no matchMedia implementation; Chakra's responsive Flex/Modal
  // components call useMediaQuery internally, which needs one.
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("PoolDetailClient shares the usePools() cache (#143)", () => {
  it("does not trigger a second getFactoryPools() call when the Farm page already populated the cache", async () => {
    const getFactoryPoolsSpy = vi
      .spyOn(sorobanService, "getFactoryPools")
      .mockResolvedValue([makePool()]);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    // Simulates visiting /farm first: a bare usePools() consumer populates
    // the shared cache.
    function FarmPageProbe() {
      usePools();
      return null;
    }
    render(
      <QueryClientProvider client={client}>
        <FarmPageProbe />
      </QueryClientProvider>,
    );
    await waitFor(() => expect(getFactoryPoolsSpy).toHaveBeenCalledTimes(1));

    // Now navigate into the pool detail page for the same pool, sharing
    // the same QueryClient — the fresh (staleTime: 30s) cache should be
    // reused, not re-fetched.
    renderDetail("pool-xlm", client);
    await screen.findByText("XLM Pool");

    expect(getFactoryPoolsSpy).toHaveBeenCalledTimes(1);
  });
});

describe("PoolDetailClient refreshes stats on usePools()'s interval (#143)", () => {
  it("updates the displayed dailyRate after refetchInterval elapses, instead of staying frozen", async () => {
    vi.useFakeTimers();
    try {
      const getFactoryPoolsSpy = vi
        .spyOn(sorobanService, "getFactoryPools")
        .mockResolvedValueOnce([makePool({ dailyRate: "0.5%" })])
        .mockResolvedValue([makePool({ dailyRate: "0.9%" })]);

      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });

      renderDetail("pool-xlm", client);

      await act(async () => {
        await vi.advanceTimersByTimeAsync(0);
      });
      expect(screen.getByText("0.5%")).toBeTruthy();
      expect(getFactoryPoolsSpy).toHaveBeenCalledTimes(1);

      // Fire the refetchInterval's timer callback (fake timers), then hand
      // off to real timers so the resulting fetch promise and React's
      // scheduler settle normally — React's scheduler doesn't reliably
      // flush under advanceTimersByTimeAsync alone. Pre-fix,
      // PoolDetailClient had no polling mechanism at all and this figure
      // would stay frozen at "0.5%" for the lifetime of the page view.
      act(() => {
        vi.advanceTimersByTime(60000);
      });
      vi.useRealTimers();

      await waitFor(() => expect(getFactoryPoolsSpy).toHaveBeenCalledTimes(2));
      await waitFor(() => expect(screen.getByText("0.9%")).toBeTruthy());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("PoolDetailClient preserves loading/not-found behavior after migration (#143)", () => {
  it("shows loading skeletons while usePools() is still pending", async () => {
    let resolvePools!: (pools: PoolInfo[]) => void;
    vi.spyOn(sorobanService, "getFactoryPools").mockReturnValue(
      new Promise((resolve) => {
        resolvePools = resolve;
      }),
    );

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderDetail("pool-xlm", client);

    // Breadcrumb falls back to a truncated poolId while loading, not the
    // pool's asset code (which isn't known yet).
    expect(screen.getByText("pool-xlm…")).toBeTruthy();
    expect(screen.queryByText("XLM Pool")).toBeNull();

    await act(async () => {
      resolvePools([makePool()]);
      await Promise.resolve();
    });
  });

  it('shows "Pool not found." when usePools() resolves without the requested poolId', async () => {
    vi.spyOn(sorobanService, "getFactoryPools").mockResolvedValue([
      makePool({ id: "some-other-pool" }),
    ]);

    const client = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });
    renderDetail("pool-xlm", client);

    expect(await screen.findByText("Pool not found.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /back to farm/i })).toBeTruthy();
    // The stats/detail layout isn't rendered in the error state.
    expect(screen.queryByText("Daily Rate")).toBeNull();
  });

  it('shows "Failed to load pool data." when the pools fetch itself fails', async () => {
    // usePools() hard-codes retry: 3 with exponential backoff, so exhausting
    // it before isError flips takes several real seconds — fake timers,
    // advanced until nothing is pending, cover the whole retry chain fast.
    vi.useFakeTimers();
    try {
      vi.spyOn(sorobanService, "getFactoryPools").mockRejectedValue(
        new Error("RPC unreachable"),
      );

      const client = new QueryClient({
        defaultOptions: { queries: { retry: false } },
      });
      renderDetail("pool-xlm", client);

      // retryDelay is min(1000 * 2^attempt, 30000) for 3 retries:
      // 1000 + 2000 + 4000 = 7000ms until isError flips. Advancing in a
      // bounded step (rather than runAllTimersAsync, which never
      // terminates here — usePools()/usePoolDepositors' refetchInterval
      // keeps rescheduling) covers the whole chain without hanging.
      await act(async () => {
        await vi.advanceTimersByTimeAsync(8000);
      });

      expect(screen.getByText("Failed to load pool data.")).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });
});

import { renderHook } from "@/test/renderHook";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createElement } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { xdr } from "@stellar/stellar-sdk";
import { useSorobanEvents, type SorobanEventsRpc } from "./useSorobanEvents";
import { QUERY_KEYS } from "./useSorobanQuery";

// Encode a user address as scvString — scValToNative returns the same plain string
// for scvString as it does for scvAddress, satisfying the hook's publicKey comparison
// without needing Keypair/ed25519 crypto that breaks in jsdom.
function addrScVal(addr: string) {
  return xdr.ScVal.scvString(addr);
}

vi.mock("@/context/StellarWalletContext", () => ({
  useStellarWallet: vi.fn(),
}));

// Known valid Stellar testnet account address (no crypto needed — just strkey parse)
const TEST_PUBLIC_KEY =
  "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
const TEST_CONTRACT_ID =
  "CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA";

describe("useSorobanEvents", () => {
  let queryClient: QueryClient;

  beforeEach(async () => {
    vi.useFakeTimers();
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false } },
    });

    const { useStellarWallet } = await import(
      "@/context/StellarWalletContext"
    );
    vi.mocked(useStellarWallet).mockReturnValue({
      publicKey: TEST_PUBLIC_KEY,
      isConnected: true,
      walletApi: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it("calls invalidateQueries with USER_POSITION key when lock_assets event arrives for the connected wallet", async () => {
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    // Build a realistic lock_assets event for the connected wallet
    const lockEvent = {
      inSuccessfulContractCall: true,
      topic: [
        xdr.ScVal.scvSymbol("lock_assets"),
        addrScVal(TEST_PUBLIC_KEY),
      ],
      contractId: TEST_CONTRACT_ID,
      value: xdr.ScVal.scvVoid(),
      txHash: "deadbeef",
      ledger: 1001,
      ledgerClosedAt: new Date().toISOString(),
      pagingToken: "1001-0-0",
      id: "1001-0-0",
      type: "contract",
    };

    const mockRpc: SorobanEventsRpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1000 }),
      getEvents: vi.fn().mockResolvedValue({
        events: [lockEvent],
        latestLedger: 1001,
      }),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(
      () => useSorobanEvents([TEST_CONTRACT_ID], ["lock_assets"], mockRpc),
      { wrapper }
    );

    // Flush microtasks so init() → getLatestLedger() resolves and setInterval is registered
    await vi.advanceTimersByTimeAsync(0);

    // Fire the first 5-second poll tick
    await vi.advanceTimersByTimeAsync(5000);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QUERY_KEYS.USER_POSITION],
    });
  });

  it("also invalidates POOLS cache on any pool event", async () => {
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    const lockEvent = {
      inSuccessfulContractCall: true,
      topic: [
        xdr.ScVal.scvSymbol("lock_assets"),
        addrScVal(TEST_PUBLIC_KEY),
      ],
      contractId: TEST_CONTRACT_ID,
      value: xdr.ScVal.scvVoid(),
      txHash: "deadbeef",
      ledger: 1001,
      ledgerClosedAt: new Date().toISOString(),
      pagingToken: "1001-0-0",
      id: "1001-0-0",
      type: "contract",
    };

    const mockRpc: SorobanEventsRpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1000 }),
      getEvents: vi.fn().mockResolvedValue({
        events: [lockEvent],
        latestLedger: 1001,
      }),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(
      () => useSorobanEvents([TEST_CONTRACT_ID], ["lock_assets"], mockRpc),
      { wrapper }
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QUERY_KEYS.POOLS],
    });
  });

  it("calls invalidateQueries with USER_CREDITS key when update_credits event arrives for the connected wallet", async () => {
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    const creditEvent = {
      inSuccessfulContractCall: true,
      topic: [
        xdr.ScVal.scvSymbol("update_credits"),
        addrScVal(TEST_PUBLIC_KEY),
      ],
      contractId: TEST_CONTRACT_ID,
      value: xdr.ScVal.scvVoid(),
      txHash: "deadbeef",
      ledger: 1001,
      ledgerClosedAt: new Date().toISOString(),
      pagingToken: "1001-0-0",
      id: "1001-0-0",
      type: "contract",
    };

    const mockRpc: SorobanEventsRpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1000 }),
      getEvents: vi.fn().mockResolvedValue({
        events: [creditEvent],
        latestLedger: 1001,
      }),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(
      () =>
        useSorobanEvents(
          [TEST_CONTRACT_ID],
          ["lock_assets", "unlock_assets", "update_credits"],
          mockRpc
        ),
      { wrapper }
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QUERY_KEYS.USER_CREDITS],
    });
  });

  it("does not invalidate USER_POSITION for events belonging to a different address", async () => {
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    const OTHER_KEY =
      "GBVVJJPQKIFE3IPQHBKUQO3SGDTCQJLWBZUOYJKPYLSJ6HI2IQJZ3NP";

    const otherEvent = {
      inSuccessfulContractCall: true,
      topic: [
        xdr.ScVal.scvSymbol("lock_assets"),
        addrScVal(OTHER_KEY),
      ],
      contractId: TEST_CONTRACT_ID,
      value: xdr.ScVal.scvVoid(),
      txHash: "deadbeef",
      ledger: 1001,
      ledgerClosedAt: new Date().toISOString(),
      pagingToken: "1001-0-0",
      id: "1001-0-0",
      type: "contract",
    };

    const mockRpc: SorobanEventsRpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1000 }),
      getEvents: vi.fn().mockResolvedValue({
        events: [otherEvent],
        latestLedger: 1001,
      }),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(
      () => useSorobanEvents([TEST_CONTRACT_ID], ["lock_assets"], mockRpc),
      { wrapper }
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);

    const userPositionCalls = invalidateQueries.mock.calls.filter((call) =>
      (call[0] as { queryKey: string[] })?.queryKey?.includes(
        QUERY_KEYS.USER_POSITION
      )
    );
    expect(userPositionCalls).toHaveLength(0);
  });

  it("clears the interval on unmount", async () => {
    const mockRpc: SorobanEventsRpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1000 }),
      getEvents: vi.fn().mockResolvedValue({ events: [], latestLedger: 1001 }),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    const { unmount } = renderHook(
      () => useSorobanEvents([TEST_CONTRACT_ID], ["lock_assets"], mockRpc),
      { wrapper }
    );

    await vi.advanceTimersByTimeAsync(0);
    expect(vi.getTimerCount()).toBeGreaterThan(0);

    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });

  it("does not start polling when wallet is disconnected", async () => {
    const { useStellarWallet } = await import("@/context/StellarWalletContext");
    vi.mocked(useStellarWallet).mockReturnValue({
      publicKey: null,
      isConnected: false,
      walletApi: null,
      connect: vi.fn(),
      disconnect: vi.fn(),
    });

    const mockRpc: SorobanEventsRpc = {
      getLatestLedger: vi.fn(),
      getEvents: vi.fn(),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(
      () => useSorobanEvents([TEST_CONTRACT_ID], ["lock_assets"], mockRpc),
      { wrapper }
    );

    await vi.advanceTimersByTimeAsync(5000);

    expect(mockRpc.getLatestLedger).not.toHaveBeenCalled();
    expect(mockRpc.getEvents).not.toHaveBeenCalled();
  });
});

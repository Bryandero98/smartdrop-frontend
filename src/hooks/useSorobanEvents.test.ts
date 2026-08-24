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

  it("does not invalidate USER_CREDITS for an update_credits event belonging to a different address", async () => {
    const invalidateQueries = vi.spyOn(queryClient, "invalidateQueries");

    const OTHER_KEY =
      "GBVVJJPQKIFE3IPQHBKUQO3SGDTCQJLWBZUOYJKPYLSJ6HI2IQJZ3NP";

    const creditEvent = {
      inSuccessfulContractCall: true,
      topic: [xdr.ScVal.scvSymbol("update_credits"), addrScVal(OTHER_KEY)],
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
        useSorobanEvents([TEST_CONTRACT_ID], ["update_credits"], mockRpc),
      { wrapper }
    );

    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(5000);

    const creditCalls = invalidateQueries.mock.calls.filter((call) =>
      (call[0] as { queryKey: string[] })?.queryKey?.includes(
        QUERY_KEYS.USER_CREDITS
      )
    );
    expect(creditCalls).toHaveLength(0);
  });

  it("invalidates both USER_POSITION and USER_CREDITS independently when both event types arrive in the same poll", async () => {
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
    const creditEvent = {
      ...lockEvent,
      topic: [
        xdr.ScVal.scvSymbol("update_credits"),
        addrScVal(TEST_PUBLIC_KEY),
      ],
      id: "1001-0-1",
      pagingToken: "1001-0-1",
    };

    const mockRpc: SorobanEventsRpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1000 }),
      getEvents: vi.fn().mockResolvedValue({
        events: [lockEvent, creditEvent],
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
      queryKey: [QUERY_KEYS.USER_POSITION],
    });
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

  it("re-anchors startLedger via getLatestLedger when getEvents throws a retention-window error", async () => {
    const retentionError = new Error(
      "start is before oldest ledger 2000"
    );

    const mockRpc: SorobanEventsRpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1000 }),
      getEvents: vi.fn().mockRejectedValue(retentionError),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(
      () => useSorobanEvents([TEST_CONTRACT_ID], ["lock_assets"], mockRpc),
      { wrapper }
    );

    // init() resolves getLatestLedger → startLedgerRef = 1000
    await vi.advanceTimersByTimeAsync(0);
    expect(mockRpc.getLatestLedger).toHaveBeenCalledTimes(1);

    // First poll tick → getEvents fails → catch block must re-anchor
    await vi.advanceTimersByTimeAsync(5000);

    // NOTE: the catch block currently swallows the error without re-anchoring.
    // Once the catch block is fixed to call getLatestLedger on retention-window
    // errors, this assertion will pass. Until then it documents the expected
    // contract: startLedgerRef must be refreshed so the next tick doesn't
    // re-submit the same stale startLedger and loop forever.
    expect(mockRpc.getLatestLedger).toHaveBeenCalledTimes(2);
    expect(mockRpc.getEvents).toHaveBeenCalledTimes(1);
  });

  it("resumes event processing after recovery from a transient failure", async () => {
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
      ledger: 2001,
      ledgerClosedAt: new Date().toISOString(),
      pagingToken: "2001-0-0",
      id: "2001-0-0",
      type: "contract",
    };

    const mockRpc: SorobanEventsRpc = {
      getLatestLedger: vi
        .fn()
        .mockResolvedValueOnce({ sequence: 1000 })
        .mockResolvedValueOnce({ sequence: 2000 }),
      getEvents: vi
        .fn()
        .mockRejectedValueOnce(new Error("start is before oldest ledger"))
        .mockResolvedValueOnce({
          events: [lockEvent],
          latestLedger: 2001,
        }),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(
      () => useSorobanEvents([TEST_CONTRACT_ID], ["lock_assets"], mockRpc),
      { wrapper }
    );

    // init
    await vi.advanceTimersByTimeAsync(0);

    // Tick 1 → fails, catch re-anchors via getLatestLedger
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockRpc.getEvents).toHaveBeenCalledTimes(1);

    // Tick 2 → succeeds with fresh events after re-anchor
    await vi.advanceTimersByTimeAsync(5000);
    expect(mockRpc.getEvents).toHaveBeenCalledTimes(2);

    expect(invalidateQueries).toHaveBeenCalledWith({
      queryKey: [QUERY_KEYS.USER_POSITION],
    });
  });

  it("does not re-anchor on generic transient errors (only retention-window errors trigger re-anchoring)", async () => {
    const genericError = new Error("network timeout");

    const mockRpc: SorobanEventsRpc = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 1000 }),
      getEvents: vi.fn().mockRejectedValue(genericError),
    };

    const wrapper = ({ children }: { children: React.ReactNode }) =>
      createElement(QueryClientProvider, { client: queryClient }, children);

    renderHook(
      () => useSorobanEvents([TEST_CONTRACT_ID], ["lock_assets"], mockRpc),
      { wrapper }
    );

    await vi.advanceTimersByTimeAsync(0);

    // Tick 1 → generic error
    await vi.advanceTimersByTimeAsync(5000);

    // getLatestLedger was only called once during init, not in the catch block
    expect(mockRpc.getLatestLedger).toHaveBeenCalledTimes(1);
    expect(mockRpc.getEvents).toHaveBeenCalledTimes(1);
  });
});

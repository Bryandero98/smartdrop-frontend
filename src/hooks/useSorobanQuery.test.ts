import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook, act } from "@/test/renderHook";
import { sorobanService } from "@/lib/soroban";
import { usePoolDepositors, useLockAssetsFeePreview } from "./useSorobanQuery";

vi.mock("@/lib/soroban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/soroban")>();
  return { ...actual, simulateLockAssets: vi.fn() };
});

const { simulateLockAssets } = await import("@/lib/soroban");
const simulateLockAssetsMock = vi.mocked(simulateLockAssets);

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

afterEach(() => {
  vi.restoreAllMocks();
  simulateLockAssetsMock.mockReset();
  vi.useRealTimers();
});

describe("usePoolDepositors (#143)", () => {
  it("fetches depositors for the given pool through sorobanService", async () => {
    const depositors = [
      { address: "GDEP1", amount: "100", credits: "10" },
      { address: "GDEP2", amount: "50", credits: "5" },
    ];
    const spy = vi
      .spyOn(sorobanService, "getPoolDepositors")
      .mockResolvedValue(depositors);

    const { result } = renderHook(() => usePoolDepositors("pool-xlm", 20), {
      wrapper,
    });

    await waitFor(() => expect(result.current.data).toEqual(depositors));

    expect(spy).toHaveBeenCalledWith("pool-xlm", 20);
  });

  it("does not fetch when poolId is empty", async () => {
    const spy = vi
      .spyOn(sorobanService, "getPoolDepositors")
      .mockResolvedValue([]);

    renderHook(() => usePoolDepositors("", 20), { wrapper });

    // Give any accidental fetch a chance to fire before asserting it didn't.
    await new Promise((r) => setTimeout(r, 0));
    expect(spy).not.toHaveBeenCalled();
  });

  it("defaults limit to 20 when not provided", async () => {
    const spy = vi
      .spyOn(sorobanService, "getPoolDepositors")
      .mockResolvedValue([]);

    renderHook(() => usePoolDepositors("pool-xlm"), { wrapper });

    await waitFor(() => expect(spy).toHaveBeenCalledWith("pool-xlm", 20));
  });
});

describe("useLockAssetsFeePreview (#134)", () => {
  it("debounces a rapid keystroke burst into a single simulateLockAssets call using the final value", async () => {
    vi.useFakeTimers();
    simulateLockAssetsMock.mockResolvedValue({
      transaction: {} as never,
      simulation: {} as never,
      feePreview: "100",
    });

    let amount = "1";
    const { result, rerender } = renderHook(
      () =>
        useLockAssetsFeePreview({
          publicKey: "GPAYER",
          poolContractId: "CPOOL",
          amount,
        }),
      { wrapper },
    );

    // A keystroke burst — each character typed on the way to "12345", none
    // of them separated by enough real time for the debounce to settle.
    for (const next of ["12", "123", "1234", "12345"]) {
      amount = next;
      act(() => rerender());
    }

    // Still within the debounce window — no RPC call yet, but the UI must
    // already reflect a pending state (not look inert).
    expect(simulateLockAssetsMock).not.toHaveBeenCalled();
    expect(result.current.isFetching).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(simulateLockAssetsMock).toHaveBeenCalledTimes(1);
    expect(simulateLockAssetsMock).toHaveBeenCalledWith({
      publicKey: "GPAYER",
      poolContractId: "CPOOL",
      amount: "12345",
    });
  });

  it("still produces a fee preview for a single, non-rapid amount entry", async () => {
    vi.useFakeTimers();
    simulateLockAssetsMock.mockResolvedValue({
      transaction: {} as never,
      simulation: {} as never,
      feePreview: "42",
    });

    const { result } = renderHook(
      () =>
        useLockAssetsFeePreview({
          publicKey: "GPAYER",
          poolContractId: "CPOOL",
          amount: "10",
        }),
      { wrapper },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    expect(simulateLockAssetsMock).toHaveBeenCalledTimes(1);
    expect(result.current.data?.feePreview).toBe("42");
  });

  it("does not call simulateLockAssets for an invalid/empty amount, even after the debounce window", async () => {
    vi.useFakeTimers();
    simulateLockAssetsMock.mockResolvedValue({
      transaction: {} as never,
      simulation: {} as never,
      feePreview: "0",
    });

    renderHook(
      () =>
        useLockAssetsFeePreview({
          publicKey: "GPAYER",
          poolContractId: "CPOOL",
          amount: "",
        }),
      { wrapper },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });

    expect(simulateLockAssetsMock).not.toHaveBeenCalled();
  });

  it("does not let a stale in-flight call from a superseded amount overwrite the fresher result", async () => {
    vi.useFakeTimers();
    let resolveFirst: (v: {
      transaction: never;
      simulation: never;
      feePreview: string;
    }) => void;
    const firstCall = new Promise<{
      transaction: never;
      simulation: never;
      feePreview: string;
    }>((resolve) => {
      resolveFirst = resolve;
    });
    simulateLockAssetsMock
      .mockReturnValueOnce(firstCall)
      .mockResolvedValueOnce({
        transaction: {} as never,
        simulation: {} as never,
        feePreview: "second",
      });

    let amount = "10";
    const { result, rerender } = renderHook(
      () =>
        useLockAssetsFeePreview({
          publicKey: "GPAYER",
          poolContractId: "CPOOL",
          amount,
        }),
      { wrapper },
    );

    // Settle the first debounced amount so its (slow) request starts.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    expect(simulateLockAssetsMock).toHaveBeenCalledTimes(1);

    // Before the first request resolves, the user changes the amount again
    // and that one also settles and resolves (fast).
    amount = "20";
    act(() => rerender());
    await act(async () => {
      await vi.advanceTimersByTimeAsync(350);
    });
    await act(async () => {
      await vi.runAllTimersAsync();
    });
    expect(simulateLockAssetsMock).toHaveBeenCalledTimes(2);
    expect(result.current.data?.feePreview).toBe("second");

    // Now the slow, superseded first request finally resolves — it must
    // not clobber the newer, already-displayed result.
    await act(async () => {
      resolveFirst({
        transaction: {} as never,
        simulation: {} as never,
        feePreview: "first",
      });
      await Promise.resolve();
    });
    expect(result.current.data?.feePreview).toBe("second");
  });
});

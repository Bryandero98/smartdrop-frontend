import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@/test/renderHook";
import type { SortKey, LeaderboardEntry } from "./useLeaderboard";

// Manually resolvable promises for controlling resolution order
function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const mockEntries: LeaderboardEntry[] = [
  { address: "addr-credits", totalCredits: 100, totalStake: 500, boostUtilization: 0.5 },
  { address: "addr-other", totalCredits: 50, totalStake: 200, boostUtilization: 0.3 },
];

const mockStakeEntries: LeaderboardEntry[] = [
  { address: "addr-stake", totalCredits: 10, totalStake: 999, boostUtilization: 0.9 },
];

let fetchLeaderboardMock: ReturnType<typeof vi.fn>;

vi.mock("./useLeaderboard", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./useLeaderboard")>();
  return {
    ...actual,
    fetchLeaderboard: (...args: unknown[]) => fetchLeaderboardMock(...args),
  };
});

// We need to import after mocking
const { useLeaderboard, fetchLeaderboard } = await import("./useLeaderboard");

describe("useLeaderboard race condition", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    fetchLeaderboardMock = vi.fn();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("reflects the most recently issued request, not whichever resolved last", async () => {
    const deferredCredits = createDeferred<{ entries: LeaderboardEntry[]; total: number }>();
    const deferredStake = createDeferred<{ entries: LeaderboardEntry[]; total: number }>();

    // First call (credits sort) returns slow promise
    // Second call (stake sort) returns fast promise
    fetchLeaderboardMock
      .mockReturnValueOnce(deferredCredits.promise)
      .mockReturnValueOnce(deferredStake.promise);

    const { result, rerender } = renderHook(() => useLeaderboard(null));

    // Initial fetch fires via effect — resolve it so hook stabilizes
    await act(async () => {
      deferredCredits.resolve({ entries: mockEntries, total: 2 });
      await deferredCredits.promise;
    });

    // Now trigger sort change → issues a new fetch with stake sort
    await act(async () => {
      result.current.setSortKey("stake");
      rerender();
    });

    // Resolve the SECOND request (stake) before the first (credits)
    await act(async () => {
      deferredStake.resolve({ entries: mockStakeEntries, total: 1 });
      await deferredStake.promise;
    });

    // The hook should show stake entries (the most recently issued request)
    expect(result.current.paged).toEqual(mockStakeEntries);
  });

  it("discards stale responses from earlier requests", async () => {
    const deferredFirst = createDeferred<{ entries: LeaderboardEntry[]; total: number }>();
    const deferredSecond = createDeferred<{ entries: LeaderboardEntry[]; total: number }>();

    fetchLeaderboardMock
      .mockReturnValueOnce(deferredFirst.promise)
      .mockReturnValueOnce(deferredSecond.promise);

    const { result, rerender } = renderHook(() => useLeaderboard(null));

    // Wait for initial fetch to be in-flight
    await act(async () => {
      // Let the initial fetch start but don't resolve it yet
    });

    // Trigger sort change → second request
    await act(async () => {
      result.current.setSortKey("stake");
      rerender();
    });

    // Resolve second (newer) request first
    await act(async () => {
      deferredSecond.resolve({ entries: mockStakeEntries, total: 1 });
      await deferredSecond.promise;
    });

    // Then resolve first (stale) request
    await act(async () => {
      deferredFirst.resolve({ entries: mockEntries, total: 2 });
      await deferredFirst.promise;
    });

    // Should still show the newer (stake) data, not the stale (credits) data
    expect(result.current.paged).toEqual(mockStakeEntries);
  });

  it("auto-refresh does not overwrite newer manual refresh data", async () => {
    const deferredAuto = createDeferred<{ entries: LeaderboardEntry[]; total: number }>();
    const deferredManual = createDeferred<{ entries: LeaderboardEntry[]; total: number }>();

    fetchLeaderboardMock
      .mockReturnValueOnce(Promise.resolve({ entries: mockEntries, total: 2 })) // initial
      .mockReturnValueOnce(deferredAuto.promise)  // auto-refresh
      .mockReturnValueOnce(deferredManual.promise); // manual refresh

    const { result, rerender } = renderHook(() => useLeaderboard(null));

    // Let initial fetch resolve
    await act(async () => {
      vi.advanceTimersByTime(0);
    });

    // Advance past initial render, then trigger a manual refresh
    // while auto-refresh is in flight
    await act(async () => {
      result.current.setSortKey("stake");
      rerender();
    });

    // Resolve auto-refresh (stale) before manual (fresh)
    await act(async () => {
      deferredAuto.resolve({ entries: mockEntries, total: 2 });
      await deferredAuto.promise;
    });

    // Resolve manual refresh (fresh)
    await act(async () => {
      deferredManual.resolve({ entries: mockStakeEntries, total: 1 });
      await deferredManual.promise;
    });

    // Should show manual refresh data
    expect(result.current.paged).toEqual(mockStakeEntries);
  });
});

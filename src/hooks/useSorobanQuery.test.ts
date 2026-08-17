import { createElement, type ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderHook } from "@/test/renderHook";
import { sorobanService } from "@/lib/soroban";
import { usePoolDepositors } from "./useSorobanQuery";

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return createElement(QueryClientProvider, { client }, children);
}

afterEach(() => {
  vi.restoreAllMocks();
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

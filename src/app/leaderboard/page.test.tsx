import { render, screen, fireEvent, act } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStellarWallet } from "@/context/StellarWalletContext";
import LeaderboardPage from "./page";

vi.mock("@/context/StellarWalletContext", () => ({
  useStellarWallet: vi.fn(),
}));

vi.mock("@/lib/soroban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/soroban")>();
  return {
    ...actual,
    sorobanService: { ...actual.sorobanService, getLeaderboard: vi.fn() },
  };
});

const { sorobanService } = await import("@/lib/soroban");
const getLeaderboardMock = vi.mocked(sorobanService.getLeaderboard);
const useStellarWalletMock = vi.mocked(useStellarWallet);

function entry(i: number) {
  return {
    address: `GADDRESS${i}${"X".repeat(48)}`.slice(0, 56),
    totalCredits: 1000 - i,
    totalStake: 500 - i,
    boostUtilization: 10,
  };
}

function renderPage() {
  return render(
    <ChakraProvider>
      <LeaderboardPage />
    </ChakraProvider>,
  );
}

function liveRegionText() {
  return screen.getByRole("status").textContent;
}

beforeEach(() => {
  getLeaderboardMock.mockReset();
  useStellarWalletMock.mockReturnValue({
    publicKey: null,
    walletApi: null,
    networkName: "TESTNET",
    isNetworkMismatch: false,
    isConnected: false,
    connect: vi.fn(),
    disconnect: vi.fn(),
  });
});

afterEach(() => {
  vi.useRealTimers();
});

describe("LeaderboardPage accessible live-refresh announcements (#86)", () => {
  it("announces the initial load with the correct rank range", async () => {
    getLeaderboardMock.mockResolvedValue({
      entries: Array.from({ length: 10 }, (_, i) => entry(i)),
      total: 42,
    });

    await act(async () => {
      renderPage();
    });

    expect(liveRegionText()).toBe(
      "Leaderboard updated, sorted by Credits, showing rank 1-10 of 42.",
    );
  });

  it("re-announces on the 30s auto-refresh when the data actually changes", async () => {
    vi.useFakeTimers();
    getLeaderboardMock
      .mockResolvedValueOnce({
        entries: Array.from({ length: 10 }, (_, i) => entry(i)),
        total: 42,
      })
      .mockResolvedValueOnce({
        entries: Array.from({ length: 10 }, (_, i) => entry(i)),
        total: 57,
      });

    await act(async () => {
      renderPage();
    });
    expect(liveRegionText()).toContain("of 42.");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(30_000);
    });

    expect(liveRegionText()).toContain("of 57.");
    expect(getLeaderboardMock).toHaveBeenCalledTimes(2);
  });

  it("announces on a manual Refresh click, not only the auto-refresh timer", async () => {
    getLeaderboardMock
      .mockResolvedValueOnce({
        entries: Array.from({ length: 10 }, (_, i) => entry(i)),
        total: 42,
      })
      .mockResolvedValueOnce({
        entries: Array.from({ length: 10 }, (_, i) => entry(i)),
        total: 99,
      });

    await act(async () => {
      renderPage();
    });
    expect(liveRegionText()).toContain("of 42.");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /refresh/i }));
    });

    expect(liveRegionText()).toContain("of 99.");
  });

  it("announces 'No results found' for a search with zero matches, not silence", async () => {
    vi.useFakeTimers();
    getLeaderboardMock.mockResolvedValue({
      entries: [entry(0)],
      total: 1,
    });

    await act(async () => {
      renderPage();
    });
    expect(liveRegionText()).toContain("of 1.");

    fireEvent.change(screen.getByPlaceholderText(/search address/i), {
      target: { value: "no-such-address" },
    });

    // Search is debounced (SEARCH_DEBOUNCE_MS = 300ms) — the announcement
    // must not flip until the debounce settles, not on every keystroke.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(liveRegionText()).toBe("No results found.");
  });

  it("computes the correct upper bound on a partial final page", async () => {
    getLeaderboardMock.mockResolvedValue({
      entries: Array.from({ length: 3 }, (_, i) => entry(i)),
      total: 3,
    });

    await act(async () => {
      renderPage();
    });

    expect(liveRegionText()).toBe(
      "Leaderboard updated, sorted by Credits, showing rank 1-3 of 3.",
    );
  });

  it("keeps aria-sort in sync with the active sort column on both the Select and Th", async () => {
    getLeaderboardMock.mockResolvedValue({
      entries: Array.from({ length: 5 }, (_, i) => entry(i)),
      total: 5,
    });

    await act(async () => {
      renderPage();
    });

    const creditsHeader = screen.getByRole("columnheader", { name: /credits/i });
    const stakeHeader = screen.getByRole("columnheader", { name: /stake/i });
    expect(creditsHeader.getAttribute("aria-sort")).toBe("descending");
    expect(stakeHeader.getAttribute("aria-sort")).toBe("none");

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: /stake/i }));
    });

    expect(creditsHeader.getAttribute("aria-sort")).toBe("none");
    expect(stakeHeader.getAttribute("aria-sort")).toBe("descending");
    expect(liveRegionText()).toContain("sorted by Stake");
  });
});

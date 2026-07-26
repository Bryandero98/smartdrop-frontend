import { render, screen, act } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useStellarWallet } from "@/context/StellarWalletContext";
import { ErrorProvider } from "@/context/ErrorContext";
import HistoryPage from "./page";

vi.mock("@/context/StellarWalletContext", () => ({
  useStellarWallet: vi.fn(),
}));

vi.mock("@/config", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/config")>();
  return { ...actual, poolContractId: "CPOOLCONTRACTID" };
});

vi.mock("@/lib/soroban", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/soroban")>();
  return { ...actual, getUserTransactionHistory: vi.fn() };
});

const { getUserTransactionHistory } = await import("@/lib/soroban");
const getUserTransactionHistoryMock = vi.mocked(getUserTransactionHistory);
const useStellarWalletMock = vi.mocked(useStellarWallet);

const connectedWallet = {
  publicKey: "GA3CD2PYXOQCXW7ZVQW3MOA3JFZCE4F4IG2FD66I55TQASPCNKYYEFRN",
  walletApi: null,
  networkName: "TESTNET",
  isNetworkMismatch: false,
  isConnected: true,
  connect: vi.fn(),
  disconnect: vi.fn(),
};

function historyEntry(i: number) {
  return {
    date: new Date(2024, 0, i + 1).toISOString(),
    action: (i % 2 === 0 ? "lock" : "unlock") as "lock" | "unlock",
    amount: "10000000",
    symbol: "XLM",
    poolId: "pool-1",
    creditsEarned: "5",
    txHash: `hash-${i}`,
  };
}

function renderPage() {
  return render(
    <ChakraProvider>
      <ErrorProvider>
        <HistoryPage />
      </ErrorProvider>
    </ChakraProvider>,
  );
}

function liveRegionText() {
  return screen.getByRole("status").textContent;
}

beforeEach(() => {
  getUserTransactionHistoryMock.mockReset();
  useStellarWalletMock.mockReturnValue(connectedWallet);
});

afterEach(() => {
  vi.useRealTimers();
});

describe("HistoryPage accessible live-refresh announcements (#86)", () => {
  it("does not announce anything while disconnected", async () => {
    useStellarWalletMock.mockReturnValue({
      ...connectedWallet,
      publicKey: null,
      isConnected: false,
    });

    await act(async () => {
      renderPage();
    });

    expect(liveRegionText()).toBe("");
  });

  it("announces the loaded range once history resolves", async () => {
    getUserTransactionHistoryMock.mockResolvedValue(
      Array.from({ length: 5 }, (_, i) => historyEntry(i)),
    );

    await act(async () => {
      renderPage();
    });

    expect(liveRegionText()).toBe(
      "History updated, showing 1-5 of 5 transactions.",
    );
  });

  it("announces 'No farming history found' rather than staying silent on zero entries", async () => {
    getUserTransactionHistoryMock.mockResolvedValue([]);

    await act(async () => {
      renderPage();
    });

    expect(liveRegionText()).toBe("No farming history found.");
  });

  it("computes the correct upper bound on a partial final page", async () => {
    // PAGE_SIZE is 20; 45 entries means the last page holds 5, not 20.
    getUserTransactionHistoryMock.mockResolvedValue(
      Array.from({ length: 45 }, (_, i) => historyEntry(i)),
    );

    await act(async () => {
      renderPage();
    });
    expect(liveRegionText()).toBe(
      "History updated, showing 1-20 of 45 transactions.",
    );

    await act(async () => {
      screen.getByRole("button", { name: "3" }).click();
    });

    expect(liveRegionText()).toBe(
      "History updated, showing 41-45 of 45 transactions.",
    );
  });
});

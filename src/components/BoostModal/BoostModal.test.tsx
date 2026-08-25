import { render, screen } from "@testing-library/react";
import { ChakraProvider } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useStellarWallet } from "@/context/StellarWalletContext";
import { useFarmStore } from "@/store/farmStore";
import BoostModal from "./BoostModal";

vi.mock("@/context/StellarWalletContext", () => ({
  useStellarWallet: vi.fn(),
}));

vi.mock("@/hooks/useSorobanQuery", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useSorobanQuery")>();
  return { ...actual, useSetBoost: vi.fn() };
});

const useStellarWalletMock = vi.mocked(useStellarWallet);
const { useSetBoost } = await import("@/hooks/useSorobanQuery");
const useSetBoostMock = vi.mocked(useSetBoost);

const defaultWallet = {
  publicKey: "GA3CD2PYXOQCXW7ZVQW3MOA3JFZCE4F4IG2FD66I55TQASPCNKYYEFRN",
  walletApi: {},
  networkName: "TESTNET",
  isNetworkMismatch: false,
  isConnected: true,
  connect: vi.fn(),
  disconnect: vi.fn(),
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

function renderModal() {
  return render(
    <QueryClientProvider client={queryClient}>
      <ChakraProvider>
        <BoostModal />
      </ChakraProvider>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  useStellarWalletMock.mockReturnValue(defaultWallet);
  useSetBoostMock.mockReturnValue({
    mutate: vi.fn(),
    isPending: false,
    reset: vi.fn(),
  } as ReturnType<typeof useSetBoost> extends infer R ? R : never);
  useFarmStore.setState({
    selectedPosition: null,
    activeModal: "none",
    pendingTxHash: null,
  });
});

describe("BoostModal", () => {
  it("does not render when modal is not open", () => {
    renderModal();
    expect(screen.queryByText("Set Boost")).toBeNull();
  });

  it("renders when boost modal is opened", () => {
    useFarmStore.setState({
      selectedPosition: {
        id: "pool-1",
        name: "XLM",
        img: "",
        earned: "10",
        stake: "50",
        dailyRate: "0.5",
        totalStakedLiquidity: "$1,000",
        symbol: "XLM",
        lockedAmount: 50,
        lockedAt: Date.now() - 86400000,
        lockPeriodSeconds: 86400,
      },
      activeModal: "boost",
    });
    renderModal();
    expect(screen.getByText("Set Boost - XLM")).toBeTruthy();
  });

  it("shows current boost allocation", () => {
    useFarmStore.setState({
      selectedPosition: {
        id: "pool-1",
        name: "XLM",
        img: "",
        earned: "10",
        stake: "50",
        dailyRate: "0.5",
        totalStakedLiquidity: "$1,000",
        symbol: "XLM",
        lockedAmount: 50,
        lockedAt: Date.now() - 86400000,
        lockPeriodSeconds: 86400,
        boostAllocation: 25,
      },
      activeModal: "boost",
    });
    renderModal();
    expect(screen.getByText("Current boost")).toBeTruthy();
    expect(screen.getAllByText("25%").length).toBeGreaterThanOrEqual(1);
  });

  it("shows warning when user has no stake", () => {
    useFarmStore.setState({
      selectedPosition: {
        id: "pool-1",
        name: "XLM",
        img: "",
        earned: "0",
        stake: "0",
        dailyRate: "0",
        totalStakedLiquidity: "$1,000",
        symbol: "XLM",
        lockedAmount: 0,
        lockedAt: 0,
        lockPeriodSeconds: 86400,
      },
      activeModal: "boost",
    });
    renderModal();
    expect(screen.getByText(/You need to deposit/)).toBeTruthy();
  });
});

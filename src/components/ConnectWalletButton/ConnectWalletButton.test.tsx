import { ChakraProvider } from "@chakra-ui/react";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { useErrorHandler } from "@/context/ErrorContext";
import {
  FREIGHTER_CONNECT_TIMEOUT_MS,
  StellarWalletProvider,
} from "@/context/StellarWalletContext";
import { FreighterError } from "@/lib/error-handler";
import ConnectWalletButton from "./ConnectWalletButton";

const freighterMock = vi.hoisted(() => ({
  getAddress: vi.fn(),
  getNetworkDetails: vi.fn(),
  isAllowed: vi.fn(),
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
}));

const errorHandlerMock = vi.hoisted(() => ({
  error: vi.fn(),
  handleError: vi.fn(),
  info: vi.fn(),
  success: vi.fn(),
  warning: vi.fn(),
  withErrorHandling: vi.fn(),
}));

vi.mock("@stellar/freighter-api", () => freighterMock);
vi.mock("@/context/ErrorContext", () => ({
  useErrorHandler: vi.fn(() => errorHandlerMock),
}));

function renderConnectButton() {
  return render(
    <ChakraProvider>
      <StellarWalletProvider>
        <ConnectWalletButton />
      </StellarWalletProvider>
    </ChakraProvider>,
  );
}

describe("ConnectWalletButton", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    vi.mocked(useErrorHandler).mockReturnValue(errorHandlerMock);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("clears loading and reports a typed timeout when Freighter never responds", async () => {
    freighterMock.isConnected.mockReturnValue(new Promise(() => {}));

    renderConnectButton();

    const button = screen.getByRole("button", { name: "Connect Freighter" });
    fireEvent.click(button);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(FREIGHTER_CONNECT_TIMEOUT_MS);
    });

    expect(errorHandlerMock.handleError).toHaveBeenCalledTimes(1);
    const [error, context] = errorHandlerMock.handleError.mock.calls[0];
    expect(error).toBeInstanceOf(FreighterError);
    expect((error as FreighterError).code).toBe("FREIGHTER_TIMEOUT");
    expect(context).toBe("Wallet Connection");
    expect(button.hasAttribute("disabled")).toBe(false);
    expect(button.textContent).toContain("Connect Freighter");
  });
});

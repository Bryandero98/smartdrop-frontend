/**
 * Tests for StellarWalletContext's visibilitychange-triggered network
 * refresh (#140).
 *
 * refreshNetworkDetails() is called from two places: connect() (already
 * bounded by withFreighterConnectTimeout via a deadlineMs) and the
 * visibilitychange listener (previously called with no deadlineMs at all,
 * falling through to an unbounded await). A hung Freighter extension on
 * that second path left networkName/isNetworkMismatch frozen forever, with
 * no error and no loading indicator. These tests cover the fix: the same
 * timeout now bounds both call sites.
 */

import { act, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  FREIGHTER_CONNECT_TIMEOUT_MS,
  StellarWalletProvider,
  useStellarWallet,
} from "./StellarWalletContext";

const freighterMock = vi.hoisted(() => ({
  getAddress: vi.fn(),
  getNetworkDetails: vi.fn(),
  isAllowed: vi.fn(),
  isConnected: vi.fn(),
  requestAccess: vi.fn(),
  signTransaction: vi.fn(),
}));

vi.mock("@stellar/freighter-api", () => freighterMock);

const TEST_PUBLIC_KEY =
  "GA3CD2PYXOQCXW7ZVQW3MOA3JFZCE4F4IG2FD66I55TQASPCNKYYEFRN";

const TESTNET_DETAILS = {
  network: "TESTNET",
  networkUrl: "https://horizon-testnet.stellar.org",
  networkPassphrase: "Test SDF Network ; September 2015",
};

const PUBLIC_DETAILS = {
  network: "PUBLIC",
  networkUrl: "https://horizon.stellar.org",
  networkPassphrase: "Public Global Stellar Network ; September 2015",
};

function Harness() {
  const { connect, networkName, isNetworkMismatch } = useStellarWallet();
  return (
    <div>
      <button onClick={() => void connect().catch(() => {})}>Connect</button>
      <div data-testid="network-name">{networkName ?? "null"}</div>
      <div data-testid="is-mismatch">{String(isNetworkMismatch)}</div>
    </div>
  );
}

function renderHarness() {
  return render(
    <StellarWalletProvider>
      <Harness />
    </StellarWalletProvider>,
  );
}

async function connectAndSettle() {
  fireEvent.click(screen.getByRole("button", { name: "Connect" }));
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

function fireVisibilityChange() {
  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  document.dispatchEvent(new Event("visibilitychange"));
}

describe("StellarWalletContext visibilitychange refresh", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    freighterMock.isConnected.mockResolvedValue({ isConnected: true });
    freighterMock.isAllowed.mockResolvedValue({ isAllowed: true });
    freighterMock.getAddress.mockResolvedValue({ address: TEST_PUBLIC_KEY });
    freighterMock.requestAccess.mockResolvedValue({
      address: TEST_PUBLIC_KEY,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("updates networkName normally on a fast, successful visibilitychange refresh", async () => {
    freighterMock.getNetworkDetails
      .mockResolvedValueOnce(TESTNET_DETAILS)
      .mockResolvedValueOnce(PUBLIC_DETAILS);

    renderHarness();
    await connectAndSettle();
    expect(screen.getByTestId("network-name").textContent).toBe("TESTNET");

    fireVisibilityChange();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(screen.getByTestId("network-name").textContent).toBe("PUBLIC");
    expect(freighterMock.getNetworkDetails).toHaveBeenCalledTimes(2);
  });

  it("resets networkName to null when a hung Freighter extension times out during a visibilitychange refresh", async () => {
    freighterMock.getNetworkDetails.mockResolvedValueOnce(TESTNET_DETAILS);

    renderHarness();
    await connectAndSettle();
    expect(screen.getByTestId("network-name").textContent).toBe("TESTNET");

    // From here on, Freighter hangs forever on every call.
    freighterMock.getNetworkDetails.mockImplementation(
      () => new Promise(() => {}),
    );

    fireVisibilityChange();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(FREIGHTER_CONNECT_TIMEOUT_MS);
    });

    expect(screen.getByTestId("network-name").textContent).toBe("null");
  });

});

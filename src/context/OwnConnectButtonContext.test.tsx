/**
 * Tests for OwnConnectButtonContext (Issue #69)
 *
 * Verifies that pages correctly signal their own inline Connect Wallet CTA
 * so AppShell can suppress the duplicate floating button.
 *
 * Acceptance criteria:
 *   - /farm          → exactly one CTA (floating suppressed) when disconnected
 *   - /farm connected → floating CTA shown (context cleared)
 *   - /farm/[poolId] modal closed → floating CTA visible
 *   - /farm/[poolId] modal open + disconnected → floating CTA suppressed
 *   - unmount cleans up → floating CTA returns after navigation
 *   - idempotent double-signal
 */

import { render, screen, act } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { useEffect, useState } from "react";
import {
  OwnConnectButtonProvider,
  useHasOwnConnectButton,
  useOwnConnectButton,
} from "@/context/OwnConnectButtonContext";

// ─── Test harness components ──────────────────────────────────────────────────

/**
 * Renders a data-testid element whose text reflects whether AppShell would
 * suppress the floating button.
 */
function FloatingButtonObserver() {
  const hasOwnCTA = useHasOwnConnectButton();
  return (
    <div data-testid="floating-suppressed">{hasOwnCTA ? "yes" : "no"}</div>
  );
}

/**
 * Simulates a page that signals it has its own CTA based on the `active` prop.
 * Uses useEffect exactly as production pages do.
 */
function PageSignaller({ active }: { active: boolean }) {
  const signal = useOwnConnectButton();
  useEffect(() => {
    signal(active);
    return () => signal(false);
  }, [active, signal]);
  return null;
}

function Tree({ showSignaller, active }: { showSignaller: boolean; active: boolean }) {
  return (
    <OwnConnectButtonProvider>
      <FloatingButtonObserver />
      {showSignaller && <PageSignaller active={active} />}
    </OwnConnectButtonProvider>
  );
}

// ─── Controlled tree for testing state transitions ────────────────────────────

function ControlledTree() {
  const [active, setActive] = useState(false);
  return (
    <OwnConnectButtonProvider>
      <FloatingButtonObserver />
      <PageSignaller active={active} />
      <button onClick={() => setActive(true)}>signal-true</button>
      <button onClick={() => setActive(false)}>signal-false</button>
    </OwnConnectButtonProvider>
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

function floatingSuppressed() {
  return screen.getByTestId("floating-suppressed").textContent === "yes";
}

describe("OwnConnectButtonContext", () => {
  it("floating button is visible when no page signals its own CTA", () => {
    render(
      <OwnConnectButtonProvider>
        <FloatingButtonObserver />
      </OwnConnectButtonProvider>,
    );
    expect(floatingSuppressed()).toBe(false);
  });

  it("/farm disconnected → floating button suppressed (exactly one CTA)", () => {
    // Page is disconnected → active=true (inline CTA visible)
    render(<Tree showSignaller active />);
    expect(floatingSuppressed()).toBe(true);
  });

  it("/farm connected → floating button shown (inline CTA gone)", () => {
    render(<ControlledTree />);
    // Initially not signalling
    expect(floatingSuppressed()).toBe(false);

    // Wallet disconnects → inline CTA appears
    act(() => {
      screen.getByText("signal-true").click();
    });
    expect(floatingSuppressed()).toBe(true);

    // Wallet connects → inline CTA gone, floating returns
    act(() => {
      screen.getByText("signal-false").click();
    });
    expect(floatingSuppressed()).toBe(false);
  });

  it("/farm/[poolId] modal closed → floating button visible", () => {
    // isOpen=false → active=false
    render(<Tree showSignaller={false} active={false} />);
    expect(floatingSuppressed()).toBe(false);
  });

  it("/farm/[poolId] modal open + disconnected → floating suppressed (inline CTA in modal)", () => {
    // isOpen=true && !isConnected → active=true
    render(<Tree showSignaller active />);
    expect(floatingSuppressed()).toBe(true);
  });

  it("unmount of page component releases the signal (floating returns after navigation)", () => {
    const { rerender } = render(<Tree showSignaller active />);
    expect(floatingSuppressed()).toBe(true);

    // Simulate navigation away: signaller unmounts
    rerender(<Tree showSignaller={false} active={false} />);
    expect(floatingSuppressed()).toBe(false);
  });

  it("idempotent: signalling true twice and false once fully releases", () => {
    render(<ControlledTree />);

    act(() => {
      screen.getByText("signal-true").click();
    });
    act(() => {
      // Second true — should not double-count
      screen.getByText("signal-true").click();
    });
    expect(floatingSuppressed()).toBe(true);

    act(() => {
      screen.getByText("signal-false").click();
    });
    expect(floatingSuppressed()).toBe(false);
  });
});

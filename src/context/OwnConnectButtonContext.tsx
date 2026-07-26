"use client";

/**
 * OwnConnectButtonContext
 *
 * Lets any page or component signal to AppShell that it is already rendering
 * its own inline Connect Wallet CTA, so the global floating button should be
 * suppressed to prevent duplicates (Issue #69).
 *
 * Usage (page/component that has its own CTA):
 *   const signalOwnCTA = useOwnConnectButton();
 *   // Call inside a useEffect or directly in render; it's idempotent.
 *   signalOwnCTA(true);   // "I have my own CTA"
 *   signalOwnCTA(false);  // "I no longer have my own CTA" (cleanup)
 *
 * Usage (AppShell, to suppress floating button):
 *   const hasOwnCTA = useHasOwnConnectButton();
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";

interface OwnConnectButtonContextValue {
  /** Number of mounted subtrees that currently declare their own CTA. */
  count: number;
  /** Register (+1) or deregister (-1) a declaration. */
  update: (delta: 1 | -1) => void;
}

const OwnConnectButtonContext = createContext<OwnConnectButtonContextValue>({
  count: 0,
  update: () => undefined,
});

/** Provider — place once near the root (inside AppShell). */
export function OwnConnectButtonProvider({ children }: { children: ReactNode }) {
  const [count, setCount] = useState(0);

  const update = useCallback((delta: 1 | -1) => {
    setCount((prev) => Math.max(0, prev + delta));
  }, []);

  return (
    <OwnConnectButtonContext.Provider value={{ count, update }}>
      {children}
    </OwnConnectButtonContext.Provider>
  );
}

/**
 * Returns `true` when at least one mounted subtree has declared it renders
 * its own Connect Wallet CTA. Intended for AppShell to suppress the floating
 * button.
 */
export function useHasOwnConnectButton(): boolean {
  const { count } = useContext(OwnConnectButtonContext);
  return count > 0;
}

/**
 * Returns a stable setter for pages / components that render their own CTA.
 * Call `signal(true)` to declare ownership and `signal(false)` to release it.
 * Cleans up automatically on unmount.
 *
 * Typical usage:
 *   const signal = useOwnConnectButton();
 *   useEffect(() => {
 *     signal(true);
 *     return () => signal(false);
 *   }, [signal]);
 *
 * Or pass a boolean condition so it reacts to state changes:
 *   useEffect(() => {
 *     signal(showingOwnCTA);
 *     return () => signal(false);
 *   }, [showingOwnCTA, signal]);
 */
export function useOwnConnectButton(): (active: boolean) => void {
  const { update } = useContext(OwnConnectButtonContext);
  const activeRef = useRef(false);

  // Clean up on unmount no matter what
  useEffect(() => {
    return () => {
      if (activeRef.current) {
        update(-1);
        activeRef.current = false;
      }
    };
  }, [update]);

  const signal = useCallback(
    (active: boolean) => {
      if (active && !activeRef.current) {
        activeRef.current = true;
        update(1);
      } else if (!active && activeRef.current) {
        activeRef.current = false;
        update(-1);
      }
    },
    [update],
  );

  return signal;
}

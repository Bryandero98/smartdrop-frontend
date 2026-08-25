"use client";

import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { rpc, xdr, scValToNative } from "@stellar/stellar-sdk";
import { useStellarWallet } from "@/context/StellarWalletContext";
import { QUERY_KEYS } from "@/hooks/useSorobanQuery";
import { sorobanRpcUrl } from "@/config";

export interface SorobanEventsRpc {
  getLatestLedger(): Promise<{ sequence: number }>;
  getEvents(
    req: Parameters<rpc.Server["getEvents"]>[0]
  ): ReturnType<rpc.Server["getEvents"]>;
}

const USER_EVENT_TOPICS = new Set(["lock_assets", "unlock_assets"]);
// `update_credits` carries the user's address at the same topic position as
// lock_assets/unlock_assets (topic[1]) — kept as its own set, rather than
// folded into USER_EVENT_TOPICS, because it drives a different query key
// (USER_CREDITS, not USER_POSITION).
const CREDIT_EVENT_TOPICS = new Set(["update_credits"]);

const POLL_INTERVAL_MS = 5_000;

// Backoff thresholds for transient errors before pausing
const PAUSE_AFTER_FAILURES = 3;

/**
 * Classify a getEvents error as "retention" (startLedger too old / range
 * invalid — must re-anchor) or "transient" (network blip, rate limit — retry
 * with backoff).
 */
export function classifyGetEventsError(err: unknown): "retention" | "transient" {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (
    lower.includes("start ledger") ||
    lower.includes("outside") ||
    lower.includes("range") ||
    lower.includes("not found") ||
    lower.includes("past") ||
    lower.includes("invalid start ledger")
  ) {
    return "retention";
  }
  return "transient";
}

/**
 * Returns the number of ticks to skip based on consecutive failure count.
 * 0 = normal, 1 = skip next, 3 = skip next 3, etc.
 */
function backoffSkips(failures: number): number {
  if (failures < PAUSE_AFTER_FAILURES) return 0;
  return Math.min(Math.floor((failures - PAUSE_AFTER_FAILURES) / 2) + 1, 10);
}

export interface UseSorobanEventsResult {
  /** Whether event polling is paused due to repeated transient failures */
  isPaused: boolean;
}

/**
 * Polls the Soroban RPC every 5 s for contract events and immediately
 * invalidates React Query cache entries when relevant events are detected,
 * rather than waiting for the next scheduled refetch. Covers pool events
 * (POOLS), position events (USER_POSITION), and credit-update events
 * (USER_CREDITS) for the connected wallet.
 *
 * On retention errors (startLedger too old), re-anchors to the latest ledger,
 * accepting the gap. On transient errors, applies exponential backoff and
 * pauses after repeated failures.
 */
export function useSorobanEvents(
  contractIds: string[],
  topics: string[],
  rpcOverride?: SorobanEventsRpc
): UseSorobanEventsResult {
  const queryClient = useQueryClient();
  const { publicKey, isConnected } = useStellarWallet();
  const startLedgerRef = useRef<number>(0);
  const consecutiveFailuresRef = useRef<number>(0);
  const skippedTicksRef = useRef<number>(0);
  const [isPaused, setIsPaused] = useState(false);

  // Stable string keys so array identity changes don't re-run the effect
  const contractKey = contractIds.join(",");
  const topicsKey = topics.join(",");

  useEffect(() => {
    if (!isConnected || !publicKey || contractIds.length === 0) return;

    const server: SorobanEventsRpc =
      rpcOverride ?? new rpc.Server(sorobanRpcUrl);

    // Pre-encode each topic string to XDR base64 so getEvents can filter them
    const topicFilters = topics.map((t) => [
      xdr.ScVal.scvSymbol(t).toXDR("base64"),
      "*",
    ]);

    let cancelled = false;
    let intervalId: ReturnType<typeof setInterval> | undefined;

    async function reAnchor(): Promise<boolean> {
      try {
        const latest = await server.getLatestLedger();
        if (cancelled) return false;
        startLedgerRef.current = latest.sequence;
        consecutiveFailuresRef.current = 0;
        skippedTicksRef.current = 0;
        setIsPaused(false);
        return true;
      } catch {
        return false;
      }
    }

    async function init() {
      const anchored = await reAnchor();
      if (!anchored || cancelled) return;

      intervalId = setInterval(async () => {
        // Apply backoff: skip ticks after repeated failures
        if (skippedTicksRef.current > 0) {
          skippedTicksRef.current--;
          return;
        }

        try {
          const response = await server.getEvents({
            startLedger: startLedgerRef.current,
            filters: [{ type: "contract", contractIds, topics: topicFilters }],
            limit: 100,
          });

          let hasPoolEvent = false;
          let hasUserEvent = false;
          let hasCreditEvent = false;

          for (const evt of response.events) {
            if (!evt.inSuccessfulContractCall) continue;
            hasPoolEvent = true;

            const topicNatives = (evt.topic as xdr.ScVal[]).map(scValToNative);
            const action = topicNatives[0] as string;
            const userAddr = topicNatives[1] as string;

            if (USER_EVENT_TOPICS.has(action) && userAddr === publicKey) {
              hasUserEvent = true;
            }
            if (CREDIT_EVENT_TOPICS.has(action) && userAddr === publicKey) {
              hasCreditEvent = true;
            }
          }

          if (hasUserEvent) {
            queryClient.invalidateQueries({
              queryKey: [QUERY_KEYS.USER_POSITION],
            });
          }
          if (hasCreditEvent) {
            queryClient.invalidateQueries({
              queryKey: [QUERY_KEYS.USER_CREDITS],
            });
          }
          if (hasPoolEvent) {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.POOLS] });
          }

          startLedgerRef.current = response.latestLedger + 1;
          // Success: reset failure tracking
          consecutiveFailuresRef.current = 0;
          skippedTicksRef.current = 0;
          setIsPaused(false);
        } catch (err) {
          const kind = classifyGetEventsError(err);

          if (kind === "retention") {
            // Ledger range expired — re-anchor to latest, accept the gap
            await reAnchor();
          } else {
            // Transient: apply backoff
            consecutiveFailuresRef.current++;
            skippedTicksRef.current = backoffSkips(
              consecutiveFailuresRef.current
            );
            if (consecutiveFailuresRef.current >= PAUSE_AFTER_FAILURES) {
              setIsPaused(true);
            }
          }
        }
      }, POLL_INTERVAL_MS);
    }

    init();

    return () => {
      cancelled = true;
      if (intervalId !== undefined) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, publicKey, contractKey, topicsKey, rpcOverride]);

  return { isPaused };
}

"use client";

import { useEffect, useRef } from "react";
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

/**
 * Polls the Soroban RPC every 5 s for contract events and immediately
 * invalidates React Query cache entries when relevant events are detected,
 * rather than waiting for the next scheduled refetch. Covers pool events
 * (POOLS), position events (USER_POSITION), and credit-update events
 * (USER_CREDITS) for the connected wallet.
 */
export function useSorobanEvents(
  contractIds: string[],
  topics: string[],
  rpcOverride?: SorobanEventsRpc
): void {
  const queryClient = useQueryClient();
  const { publicKey, isConnected } = useStellarWallet();
  const startLedgerRef = useRef<number>(0);

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

    async function init() {
      try {
        const latest = await server.getLatestLedger();
        if (cancelled) return;
        startLedgerRef.current = latest.sequence;
      } catch {
        return;
      }

      intervalId = setInterval(async () => {
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
          }

          if (hasUserEvent) {
            queryClient.invalidateQueries({
              queryKey: [QUERY_KEYS.USER_POSITION],
            });
          }
          if (hasPoolEvent) {
            queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.POOLS] });
          }

          startLedgerRef.current = response.latestLedger + 1;
        } catch {
          // Silent: polling continues on next tick
        }
      }, 5000);
    }

    init();

    return () => {
      cancelled = true;
      if (intervalId !== undefined) clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isConnected, publicKey, contractKey, topicsKey, rpcOverride]);
}

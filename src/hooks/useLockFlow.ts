"use client";

/**
 * useLockFlow — encapsulates the full simulate → sign → submit → confirm
 * deposit state machine for the farm page deposit modal.
 *
 * Consumers get a single `execute()` function and reactive state that drives
 * the step-by-step UI without any business logic leaking into the component.
 */

import { useCallback, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { lockAssets, type FreighterWalletApi } from "@/lib/soroban";
import { normalizeError } from "@/lib/error-handler";
import { trackEvent } from "@/lib/analytics";
import {
  type DepositRecord,
  type DepositStep,
  isDepositPending,
} from "@/types/farm";
import { QUERY_KEYS } from "@/hooks/useSorobanQuery";

export interface LockFlowParams {
  poolId: string;
  symbol: string;
  publicKey: string;
  walletApi: FreighterWalletApi | null;
}

export interface LockFlowState {
  step: DepositStep;
  record: DepositRecord | null;
  error: string | null;
  isPending: boolean;
  execute: (displayAmount: number) => Promise<void>;
  reset: () => void;
}

export function useLockFlow({
  poolId,
  symbol,
  publicKey,
  walletApi,
}: LockFlowParams): LockFlowState {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<DepositStep>("idle");
  const [record, setRecord] = useState<DepositRecord | null>(null);
  const [error, setError] = useState<string | null>(null);
  const walletApiRef = useRef(walletApi);
  walletApiRef.current = walletApi;

  const reset = useCallback(() => {
    setStep("idle");
    setRecord(null);
    setError(null);
  }, []);

  const execute = useCallback(
    async (displayAmount: number) => {
      if (isDepositPending(step)) return;

      setError(null);
      setRecord(null);

      const start = Date.now();
      trackEvent("deposit_initiated", { poolId, symbol, displayAmount });

      try {
        if (!walletApi || !publicKey) {
          throw new Error("Wallet not connected. Please connect Freighter before depositing.");
        }

        setStep("simulating");
        // Freighter internally simulates then surfaces the popup
        setStep("signing");

        const result = await lockAssets({
          poolContractId: poolId,
          publicKey,
          amount: String(displayAmount),
          walletApi,
          onStep: setStep,
          isStillConnected: () => walletApiRef.current === walletApi,
        });

        if (!result.success) {
          throw new Error(result.error ?? "Transaction failed");
        }

        setStep("submitting");

        const txHash = result.hash ?? result.transactionHash ?? "";
        const depositRecord: DepositRecord = {
          poolId,
          symbol,
          displayAmount,
          txHash,
          confirmedAt: Date.now(),
        };

        setRecord(depositRecord);
        setStep("success");

        trackEvent("deposit_succeeded", {
          poolId,
          symbol,
          displayAmount,
          txHash,
          durationMs: Date.now() - start,
        });

        // Invalidate position and pool caches so the UI reflects the new stake.
        // This is the superset of both useLockAssets' onSuccess invalidations
        // (#83) and useLockFlow's original set, ensuring no stale data regardless
        // of which entry point triggered the deposit.
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.POOLS] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_POSITION] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_POSITION, poolId] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_POSITION, 'all', publicKey] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_CREDITS, poolId] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PLATFORM_STATS] });
        queryClient.invalidateQueries({ queryKey: ['stellarBalance', publicKey] });

      } catch (err) {
        const normalized = normalizeError(err, "Deposit");
        setError(normalized.userMessage ?? normalized.message);
        setStep("error");

        trackEvent("deposit_failed", {
          poolId,
          symbol,
          displayAmount,
          errorCode: normalized.code,
          durationMs: Date.now() - start,
        });
      }
    },
    [step, poolId, symbol, publicKey, walletApi, queryClient],
  );

  return {
    step,
    record,
    error,
    isPending: isDepositPending(step),
    execute,
    reset,
  };
}

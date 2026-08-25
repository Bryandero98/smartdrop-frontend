"use client";

import {
    poolContractId,
    stellarNetwork,
} from "@/config";
import { useErrorHandler } from "@/context/ErrorContext";
import { useStellarWallet } from "@/context/StellarWalletContext";
import { useCountdown } from "@/hooks/useCountdown";
import { trackEvent } from "@/lib/analytics";
import {
    stellarExpertTxUrl,
    unlockAssets,
    computePartialUnlockPreview,
    getContractErrorMessage,
    type UserPosition,
} from "@/lib/soroban";
import { QUERY_KEYS } from "@/hooks/useSorobanQuery";
import { useFarmStore } from "@/store/farmStore";
import { unlockAvailableAt } from "@/types/farm";
import { useQueryClient } from "@tanstack/react-query";
import {
    Alert,
    AlertIcon,
    Badge,
    Box,
    Button,
    Flex,
    Input,
    Link,
    Modal,
    ModalBody,
    ModalCloseButton,
    ModalContent,
    ModalHeader,
    ModalOverlay,
    Spinner,
    Text,
} from "@chakra-ui/react";
import { useEffect, useMemo, useRef, useState } from "react";

type UnlockStep =
  | "idle"
  | "signing"
  | "submitting"
  | "confirming"
  | "success"
  | "timeout"
  | "error";

const UNLOCK_STEP_LABEL: Record<UnlockStep, string> = {
  idle: "",
  signing: "Waiting for Freighter signature...",
  submitting: "Submitting transaction to Stellar...",
  confirming: "Confirming transaction on Stellar...",
  success: "Unlock confirmed",
  timeout: "Confirmation is taking longer than expected.",
  error: "Unlock failed",
};

export default function UnlockModal() {
  const selectedPosition = useFarmStore((s) => s.selectedPosition);
  const isUnlock = useFarmStore((s) => s.activeModal === "unlock");
  const close = useFarmStore((s) => s.close);
  const position = selectedPosition;
  const { publicKey, walletApi, isNetworkMismatch } = useStellarWallet();
  const toast = useErrorHandler();
  const queryClient = useQueryClient();
  const [amount, setAmount] = useState("");
  const [step, setStep] = useState<UnlockStep>("idle");
  const [error, setError] = useState<string | null>(null);
  const [txHash, setTxHash] = useState<string | null>(null);
  const amountInputRef = useRef<HTMLInputElement>(null);
  const selectedPoolContractId = position?.contractAddress || poolContractId;

  const unlockAt = position ? unlockAvailableAt(position) : 0;
  const countdown = useCountdown(unlockAt);
  const canUnlock = Boolean(position) && countdown.isElapsed;
  const isProcessing =
    step === "signing" || step === "submitting" || step === "confirming";

  const numericAmount = Number(amount);
  const amountValid =
    Number.isFinite(numericAmount) &&
    numericAmount >= 0.01 &&
    !!position &&
    numericAmount <= position.lockedAmount;

  // Reset transient state whenever the modal opens for a (new) position.
  useEffect(() => {
    if (isUnlock && position) {
      setAmount(String(position.lockedAmount));
      setStep("idle");
      setError(null);
      setTxHash(null);

      // Focus the amount input using a scoped ref instead of document.querySelector.
      // Use a short delay to allow Chakra's Modal animation to complete.
      setTimeout(() => {
        amountInputRef.current?.focus();
        amountInputRef.current?.select();
      }, 100);
    }
  }, [isUnlock, position]);

  const explorerUrl = useMemo(
    () => (txHash ? stellarExpertTxUrl(txHash, stellarNetwork.toLowerCase()) : null),
    [txHash]
  );

  if (!position) return null;

  const handleClose = () => {
    if (isProcessing) return;
    close();
  };

  const setMax = () => setAmount(String(position.lockedAmount));
  const set50Pct = () => setAmount(String(position.lockedAmount / 2));

  const numericDailyRate = parseFloat(position.dailyRate) || 0;
  const { remainingStake, newDailyRate } = computePartialUnlockPreview(
    position.lockedAmount,
    numericAmount,
    numericDailyRate,
  );

  const handleUnlock = async () => {
    if (!publicKey || !walletApi) {
      setError("Connect your Freighter wallet to unlock.");
      setStep("error");
      return;
    }
    if (isNetworkMismatch) {
      setError(`Switch Freighter to ${stellarNetwork} to unlock.`);
      return;
    }
    if (!selectedPoolContractId) {
      setError("Pool contract is not configured.");
      setStep("error");
      return;
    }
    if (!canUnlock) {
      setError("Lock period has not elapsed yet.");
      setStep("error");
      return;
    }
    if (!amountValid) {
      setError(`Enter an amount between 0.01 and ${position.lockedAmount}.`);
      setStep("error");
      return;
    }

    // Additional validation for minimum unlock amount
    if (numericAmount < 0.01) {
      setError("Minimum unlock amount is 0.01.");
      setStep("error");
      return;
    }

    setError(null);
    setTxHash(null);
    setStep("signing");
    const trackingStartTime = Date.now();
    trackEvent("unlock_initiated", {
      farm: position.name,
      symbol: position.symbol,
      amount: numericAmount,
      partial: numericAmount < position.lockedAmount,
      lockPeriodElapsed: canUnlock,
      timeRemaining: countdown.remainingMs,
      userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'unknown',
    });

    // Snapshot the current position so we can rollback on failure.
    const positionKey = [QUERY_KEYS.USER_POSITION, selectedPoolContractId, publicKey];
    const previousPosition = queryClient.getQueryData<UserPosition>(positionKey);

    // Optimistically reduce the locked amount in the cache so the UI
    // reflects the unlock immediately, before the ledger confirms.
    if (previousPosition) {
      const prevAmount = Number(previousPosition.amount);
      const unlockedAmount = Math.min(numericAmount, prevAmount);
      const newAmount = Math.max(0, prevAmount - unlockedAmount);
      queryClient.setQueryData<UserPosition>(positionKey, {
        ...previousPosition,
        amount: String(newAmount),
        isLocked: false,
        unlockableAt: 0,
      });
    }

    try {
      const result = await unlockAssets({
        poolContractId: selectedPoolContractId,
        publicKey,
        amount,
        walletApi,
        onHash: (hash) => setTxHash(hash),
        onStep: (nextStep) => setStep(nextStep),
      });
      const hash = result.hash || result.transactionHash;
      setTxHash(hash || null);

      if (!result.success) {
        // Roll back the optimistic update for definitive failures.
        // On TIMEOUT the transaction may still land, so keep the
        // optimistic state — the next refetch will correct it.
        if (result.status !== "TIMEOUT" && previousPosition) {
          queryClient.setQueryData<UserPosition>(positionKey, previousPosition);
        }

        const userMessage =
          result.status === "TIMEOUT"
            ? "Confirmation is taking longer than expected. You can check the transaction manually on Stellar Expert."
            : getContractErrorMessage(result.errorCode) ??
              result.error ??
              "Unlock transaction failed.";

        setError(userMessage);
        setStep(result.status === "TIMEOUT" ? "timeout" : "error");
        trackEvent("unlock_failed", {
          farm: position.name,
          symbol: position.symbol,
          amount: numericAmount,
          reason: result.status ?? result.errorCode ?? "FAILED",
          errorMessage: userMessage,
        });
        return;
      }

      setStep("success");
      toast.success(
        "Unlock Submitted",
        `${numericAmount} ${position.symbol} unlock transaction submitted successfully`
      );
      trackEvent("unlock_succeeded", {
        farm: position.name,
        symbol: position.symbol,
        amount: numericAmount,
        hash,
        partial: numericAmount < position.lockedAmount,
        processingTime: Date.now() - trackingStartTime,
      });

      // Invalidate so the next refetch picks up the real ledger state
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_POSITION, selectedPoolContractId] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_POSITION, 'all', publicKey] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_CREDITS, selectedPoolContractId] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.POOLS] });
      queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PLATFORM_STATS] });
    } catch (err) {
      // Roll back the optimistic update on thrown errors
      if (previousPosition) {
        queryClient.setQueryData<UserPosition>(positionKey, previousPosition);
      }

      const normalizedError = toast.handleError(err, "Unlock Transaction");
      setError(normalizedError.userMessage);
      setStep("error");
      trackEvent("unlock_failed", {
        farm: position.name,
        symbol: position.symbol,
        amount: numericAmount,
        reason: normalizedError.code,
        errorMessage: normalizedError.message,
      });
    }
  };

  const infoRow = (label: string, value: React.ReactNode) => (
    <Flex justify="space-between" fontSize="sm" py={1}>
      <Text color="app.muted">{label}</Text>
      <Text>{value}</Text>
    </Flex>
  );

  return (
    <Modal isOpen={isUnlock} onClose={handleClose}>
      <ModalOverlay backdropFilter="blur(3px)" />
      <ModalContent
        bg="app.surface"
        color="app.text"
        borderRadius="3xl"
        mx={{ base: 4, md: "auto" }}
      >
        <ModalHeader mx="auto">Unlock {position.symbol}</ModalHeader>
        <ModalCloseButton isDisabled={isProcessing} />
        <ModalBody p={{ base: 4, md: 8 }}>
          {step === "success" ? (
            <Flex direction="column" gap={4} align="center" textAlign="center">
              <Badge colorScheme="green" borderRadius="full" px={3} py={1}>
                Unlock confirmed
              </Badge>
                <Text fontSize="sm" color="app.muted">
                {numericAmount} {position.symbol} unlock transaction submitted successfully.
                Your assets will be available in your wallet shortly.
              </Text>
              <Box
                w="100%"
                border="1px solid"
                borderColor="app.border"
                borderRadius="2xl"
                p={3}
              >
                {infoRow(
                  "Remaining stake",
                  `${Math.max(0, position.lockedAmount - numericAmount)} ${
                    position.symbol
                  }`
                )}
                {explorerUrl &&
                  infoRow(
                    "Transaction",
                    <Link href={explorerUrl} isExternal color="app.accent">
                      View on Stellar Expert
                    </Link>
                  )}
              </Box>
              <Button
                borderRadius="2xl"
                w="full"
                bg="app.accent"
                color="app.onAccent"
                _hover={{ opacity: 0.9 }}
                onClick={handleClose}
              >
                Done
              </Button>
            </Flex>
          ) : (
            <Flex direction="column" gap={6}>
              <Box border="1px solid" borderColor="app.border" borderRadius="2xl" p={3}>
                {infoRow(
                  "Amount locked",
                  `${position.lockedAmount} ${position.symbol}`
                )}
                {infoRow(
                  "Time remaining",
                  <Text color={canUnlock ? "app.accent" : "app.text"}>
                    {countdown.label}
                  </Text>
                )}
                {infoRow(
                  "Available to unlock",
                  `${canUnlock ? position.lockedAmount : 0} ${position.symbol}`
                )}
              </Box>

              {!canUnlock && (
                <Alert
                  status="warning"
                  borderRadius="2xl"
                  bg="#2a2412"
                  color="#f6c453"
                  fontSize="sm"
                >
                  <AlertIcon color="#f6c453" />
                  Assets are time-locked for security. You can unlock once the countdown
                  reaches zero to protect against impulsive withdrawals.
                </Alert>
              )}

              <Flex direction="column" gap={2}>
                <Text fontSize="2xs" color="app.muted">
                  Amount to unlock (partial allowed)
                </Text>
                <Box position="relative" w="100%">
                  <Input
                    ref={amountInputRef}
                    type="number"
                    borderRadius="2xl"
                    placeholder="Amount"
                    h="50px"
                    w="full"
                    pr="120px"
                    value={amount}
                    onChange={(e) => setAmount(e.target.value)}
                    isDisabled={!canUnlock || isProcessing}
                    borderColor="app.border"
                    bg="app.inputBg"
                    color="app.text"
                    _placeholder={{ color: "app.muted" }}
                    _hover={{ borderColor: "app.accent" }}
                    _focus={{ boxShadow: "none", borderColor: "app.accent" }}
                  />
                  <Flex
                    position="absolute"
                    top="50%"
                    right="12px"
                    transform="translateY(-50%)"
                    gap={3}
                    align="center"
                  >
                    <Text fontSize="sm">{position.symbol}</Text>
                    <Text
                      fontSize="xs"
                      color="app.accent"
                      cursor={canUnlock ? "pointer" : "not-allowed"}
                      onClick={canUnlock ? set50Pct : undefined}
                      _hover={canUnlock ? { opacity: 0.8 } : {}}
                      transition="opacity 0.2s"
                    >
                      50%
                    </Text>
                    <Text
                      fontSize="xs"
                      color="app.accent"
                      cursor={canUnlock ? "pointer" : "not-allowed"}
                      onClick={canUnlock ? setMax : undefined}
                      _hover={canUnlock ? { opacity: 0.8 } : {}}
                      transition="opacity 0.2s"
                    >
                      Max
                    </Text>
                  </Flex>
                </Box>
              </Flex>

              {amountValid && (
                <Box border="1px solid #303030" borderRadius="2xl" p={3}>
                  {infoRow(
                    "Remaining stake",
                    `${remainingStake.toFixed(4)} ${position.symbol}`,
                  )}
                  {infoRow(
                    "New daily rate",
                    `${newDailyRate.toFixed(6)} credits/day`,
                  )}
                </Box>
              )}

              {isProcessing && (
                <Alert status="info" borderRadius="2xl" bg="app.inputBg" color="app.text">
                  <Flex align="center" gap={3} w="full">
                    <Spinner size="sm" color="app.accent" />
                    <Box>
                      <Text fontSize="sm" fontWeight="semibold" aria-live="polite" aria-atomic="true">
                        {UNLOCK_STEP_LABEL[step]}
                      </Text>
                      {step === "confirming" && txHash && explorerUrl && (
                        <Link href={explorerUrl} isExternal color="app.accent" fontSize="sm">
                          View transaction on Stellar Expert
                        </Link>
                      )}
                    </Box>
                  </Flex>
                </Alert>
              )}

              {step === "timeout" && (
                <Alert status="warning" borderRadius="2xl" bg="#2a2412" color="#f6c453" aria-live="assertive" aria-atomic="true">
                  <AlertIcon color="#f6c453" />
                  <Flex direction="column" gap={1}>
                    <Text>Confirmation is taking longer than expected.</Text>
                    {explorerUrl && (
                      <Link href={explorerUrl} isExternal color="app.accent">
                        Check the transaction on Stellar Expert
                      </Link>
                    )}
                  </Flex>
                </Alert>
              )}

              {amountValid &&
                !!position.minDepositAmount &&
                remainingStake > 0 &&
                remainingStake < position.minDepositAmount && (
                  <Alert
                    status="warning"
                    borderRadius="2xl"
                    bg="#2a2412"
                    color="#f6c453"
                    fontSize="sm"
                  >
                    <AlertIcon color="#f6c453" />
                    Warning: remaining stake below minimum — the contract will close this position entirely
                  </Alert>
                )}

              {error && step !== "timeout" && (
                <Alert
                  status="error"
                  borderRadius="2xl"
                  bg="#2a1414"
                  color="#ff8080"
                  fontSize="sm"
                  aria-live="assertive"
                  aria-atomic="true"
                >
                  <AlertIcon color="#ff8080" />
                  {error}
                </Alert>
              )}

              <Button
                borderRadius="2xl"
                bg="app.accent"
                color="app.onAccent"
                _hover={{ opacity: 0.9 }}
                isDisabled={!canUnlock || !amountValid || isProcessing || isNetworkMismatch}
                onClick={() => void handleUnlock()}
                w="full"
              >
                {isProcessing ? (
                  <Flex align="center" gap={2}>
                    <Spinner size="sm" />
                    <Text>{UNLOCK_STEP_LABEL[step]}</Text>
                  </Flex>
                ) : (
                  "Unlock with Freighter"
                )}
              </Button>
            </Flex>
          )}
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

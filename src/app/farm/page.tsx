"use client";

import { PlatformStats } from "@/components/PlatformStats/PlatformStats";
import ConnectWalletButton from "@/components/ConnectWalletButton/ConnectWalletButton";
import UnlockModal from "@/components/UnlockModal/UnlockModal";
import { EarningRow, MetricColumn } from "@/app/farm/EarningRow";
import {
  factoryContractId,
  minLockPeriodSeconds,
  sorobanRpcUrl,
  stellarNetwork,
} from "@/config";
import { useStellarWallet } from "@/context/StellarWalletContext";
import {
  QUERY_KEYS,
  useAllUserPositions,
  useLockAssets,
  useLockAssetsFeePreview,
  usePools,
  useStellarBalance,
} from "@/hooks/useSorobanQuery";
import { useSorobanEvents } from "@/hooks/useSorobanEvents";
import { stellarExpertTxUrl } from "@/lib/soroban";
import type { UserPosition } from "@/lib/soroban";
import {
  DEPOSIT_STEP_LABEL,
  isDepositPending,
  type DepositStep,
  type FarmPosition,
} from "@/types/farm";
import {
  Alert,
  AlertIcon,
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
  useToast,
} from "@chakra-ui/react";
import { useOwnConnectButton } from "@/context/OwnConnectButtonContext";
import { useQueryClient } from "@tanstack/react-query";
import NextLink from "next/link";
import { useEffect, useMemo, useState } from "react";

const ACCENT = "#4AE292";

type LivePoolRow = {
  id: string;
  contractAddress: string;
  name: string;
  earned: string;
  stake: string;
  dailyRate: string;
  totalStakedLiquidity: string;
  symbol: string;
  lockedAmount: number;
  lockedAt: number;
  lockPeriodSeconds: number;
};

function formatLockPeriod(seconds: number): string {
  if (seconds >= 86400) {
    const days = Math.ceil(seconds / 86400);
    return `${days} day${days === 1 ? "" : "s"}`;
  }
  if (seconds >= 3600) {
    const hours = Math.ceil(seconds / 3600);
    return `${hours} hour${hours === 1 ? "" : "s"}`;
  }
  const minutes = Math.max(1, Math.ceil(seconds / 60));
  return `${minutes} minute${minutes === 1 ? "" : "s"}`;
}

function shortHash(hash: string): string {
  return `${hash.slice(0, 10)}...${hash.slice(-6)}`;
}

function DepositModal({
  farm,
  isOpen,
  onClose,
}: {
  farm: LivePoolRow | null;
  isOpen: boolean;
  onClose: () => void;
}) {
  const { publicKey, isConnected, isNetworkMismatch } = useStellarWallet();
  const [amount, setAmount] = useState("");
  const [txHash, setTxHash] = useState<string | null>(null);
  const [step, setStep] = useState<DepositStep>("idle");
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedContractAddress = farm?.contractAddress || farm?.id || "";
  const queryClient = useQueryClient();
  const balanceQuery = useStellarBalance(publicKey ?? undefined);
  const trimmedAmount = amount.trim();
  const numericAmount = Number(trimmedAmount);
  const amountFormatValid = /^\d+(?:\.\d+)?$/.test(trimmedAmount);
  const decimalPlaces = trimmedAmount.includes(".")
    ? trimmedAmount.split(".")[1]?.length ?? 0
    : 0;
  const amountValid =
    !!trimmedAmount &&
    amountFormatValid &&
    decimalPlaces <= 7 &&
    Number.isFinite(numericAmount) &&
    numericAmount > 0;
  const availableBalance = balanceQuery.data;
  const exceedsBalance =
    amountValid &&
    typeof availableBalance === "number" &&
    numericAmount > availableBalance;
  const feePreview = useLockAssetsFeePreview({
    publicKey,
    poolContractId: selectedContractAddress,
    amount: amountValid ? trimmedAmount : "",
  });
  const lockMutation = useLockAssets({
    onHash: (hash) => setTxHash(hash),
    onStep: (nextStep) => setStep(nextStep),
  });

  const isFeeSponsored =
    isConnected &&
    typeof availableBalance === "number" &&
    availableBalance < 1.0 &&
    !!process.env.NEXT_PUBLIC_FEE_SPONSOR_PUBLIC_KEY;

  const isPending = lockMutation.isPending || isDepositPending(step);
  const canSubmit =
    isConnected &&
    !!farm &&
    !!publicKey &&
    amountValid &&
    !exceedsBalance &&
    !balanceQuery.isLoading &&
    !balanceQuery.isError &&
    !feePreview.isLoading &&
    !feePreview.isFetching &&
    !feePreview.isError &&
    !!feePreview.data &&
    !isNetworkMismatch &&
    !isPending;

  useEffect(() => {
    if (isOpen) {
      setAmount("");
      setTxHash(null);
      setStep("idle");
      setLocalError(null);
      lockMutation.reset();
    }
    // Reset only when the modal opens or the selected pool changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, farm?.id]);

  const resetAndClose = () => {
    setAmount("");
    setTxHash(null);
    setStep("idle");
    setLocalError(null);
    lockMutation.reset();
    onClose();
  };

  const handleClose = () => {
    if (isPending) return;
    resetAndClose();
  };

  const handleSubmit = async () => {
    if (!farm || !publicKey) {
      setLocalError("Connect your Freighter wallet to deposit.");
      return;
    }
    if (isNetworkMismatch) {
      setLocalError(`Switch Freighter to ${stellarNetwork} to deposit.`);
      return;
    }
    if (!canSubmit) {
      setLocalError("Enter a valid amount and wait for the fee preview.");
      return;
    }

    setLocalError(null);
    setTxHash(null);

    try {
      const result = await lockMutation.mutateAsync({
        poolId: selectedContractAddress,
        amount: trimmedAmount,
      });

      if (!result.success) {
        setStep("error");
        setLocalError(result.error ?? "Deposit failed. Please try again.");
        return;
      }

      queryClient.invalidateQueries({
        queryKey: [QUERY_KEYS.USER_POSITION, farm.id],
      });
      resetAndClose();
    } catch (error) {
      setStep("error");
      setLocalError(
        error instanceof Error ? error.message : "Deposit failed. Please try again.",
      );
    }
  };

  const explorerUrl = txHash
    ? stellarExpertTxUrl(txHash, stellarNetwork.toLowerCase())
    : null;
  const lockPeriod = formatLockPeriod(
    farm?.lockPeriodSeconds || minLockPeriodSeconds,
  );

  if (!farm) return null;

  return (
    <Modal isOpen={isOpen} onClose={handleClose}>
      <ModalOverlay backdropFilter="blur(3px)" />
      <ModalContent
        bg="app.surface"
        color="app.text"
        borderRadius="3xl"
        mx={{ base: 4, md: "auto" }}
      >
        <ModalHeader mx="auto">Deposit {farm.symbol}</ModalHeader>
        <ModalCloseButton isDisabled={isPending} />
        <ModalBody p={{ base: 4, md: 8 }}>
          <Flex direction="column" gap={5}>
            <Box>
              <Text fontWeight="semibold">{farm.name}</Text>
              <Text fontSize="sm" color="app.muted">
                Lock {farm.symbol} to earn credits from this pool.
              </Text>
            </Box>

            <Box border="1px solid" borderColor="app.border" borderRadius="2xl" p={3}>
              <Flex justify="space-between" fontSize="sm" py={1} gap={4}>
                <Text color="app.muted">Available balance</Text>
                <Text textAlign="right">
                  {balanceQuery.isLoading
                    ? "Loading..."
                    : typeof availableBalance === "number"
                      ? `${availableBalance.toLocaleString(undefined, {
                          maximumFractionDigits: 7,
                        })} XLM`
                      : "Unavailable"}
                </Text>
              </Flex>
              <Flex justify="space-between" fontSize="sm" py={1} gap={4}>
                <Text color="app.muted">Estimated Soroban fee</Text>
                <Text textAlign="right">
                  {feePreview.isFetching
                    ? "Simulating..."
                    : feePreview.data
                      ? `${feePreview.data.feePreview} stroops`
                      : "Enter amount"}
                </Text>
              </Flex>
              <Flex justify="space-between" fontSize="sm" py={1} gap={4}>
                <Text color="app.muted">Minimum lock period</Text>
                <Text textAlign="right">{lockPeriod}</Text>
              </Flex>
            </Box>

            <Flex direction="column" gap={2}>
              <Text fontSize="sm">Amount ({farm.symbol})</Text>
              <Box position="relative">
                <Input
                  type="number"
                  min={0}
                  step="0.0000001"
                  placeholder="0"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  isDisabled={isPending}
                  borderRadius="2xl"
                  h="50px"
                  borderColor="app.border"
                  bg="app.inputBg"
                  _placeholder={{ color: "app.muted" }}
                  _hover={{ borderColor: "app.accent" }}
                  _focus={{ boxShadow: "none", borderColor: "app.accent" }}
                  pr="72px"
                />
                <Text
                  position="absolute"
                  top="50%"
                  right="14px"
                  transform="translateY(-50%)"
                  fontSize="xs"
                  color="app.muted"
                  pointerEvents="none"
                >
                  {farm.symbol}
                </Text>
              </Box>
              {!!trimmedAmount && !amountValid && (
                <Text fontSize="xs" color="#ff8080">
                  Enter a positive amount with no more than 7 decimals.
                </Text>
              )}
              {exceedsBalance && (
                <Text fontSize="xs" color="#ff8080">
                  Amount exceeds your Horizon XLM balance.
                </Text>
              )}
            </Flex>

            {isPending && (
              <Flex
                align="center"
                gap={3}
                bg="app.inputBg"
                borderRadius="2xl"
                p={4}
                border="1px solid"
                borderColor="app.border"
              >
                <Spinner size="sm" color="app.accent" />
                <Text fontSize="sm" color="app.muted">
                  {DEPOSIT_STEP_LABEL[step] || "Processing deposit..."}
                </Text>
              </Flex>
            )}

            {txHash && (
              <Box border="1px solid" borderColor="app.border" borderRadius="2xl" p={3}>
                <Flex justify="space-between" fontSize="sm" gap={4}>
                  <Text color="app.muted">Transaction</Text>
                  {explorerUrl ? (
                    <Link href={explorerUrl} isExternal color="app.accent" fontFamily="mono">
                      {shortHash(txHash)}
                    </Link>
                  ) : (
                    <Text fontFamily="mono">{shortHash(txHash)}</Text>
                  )}
                </Flex>
              </Box>
            )}

            {feePreview.isError && (
              <Alert status="error" borderRadius="2xl" bg="#2a1414" color="#ff8080">
                <AlertIcon color="#ff8080" />
                Fee simulation failed. Check the amount and try again.
              </Alert>
            )}

            {balanceQuery.isError && (
              <Alert status="error" borderRadius="2xl" bg="#2a1414" color="#ff8080">
                <AlertIcon color="#ff8080" />
                Unable to load your Horizon balance.
              </Alert>
            )}

            {localError && (
              <Alert status="error" borderRadius="2xl" bg="#2a1414" color="#ff8080">
                <AlertIcon color="#ff8080" />
                {localError}
              </Alert>
            )}

            {isFeeSponsored && (
              <Alert status="warning" borderRadius="2xl" bg="#2d2216" color="#ffb86c" fontSize="sm" border="1px solid #7c5c24">
                <AlertIcon color="#ffb86c" />
                Your fees are sponsored for this transaction
              </Alert>
            )}

            {!isConnected && (
              <Alert status="warning" borderRadius="2xl" bg="#2a2412" color="#f6c453">
                <AlertIcon color="#f6c453" />
                Connect your Freighter wallet to deposit.
              </Alert>
            )}

            <Button
              borderRadius="2xl"
              bg="app.accent"
              color="app.onAccent"
              _hover={{ opacity: isPending ? 1 : 0.9 }}
              isDisabled={!canSubmit}
              onClick={() => void handleSubmit()}
              w="full"
            >
              {isPending ? (
                <Flex align="center" gap={2}>
                  <Spinner size="xs" />
                  <Text>
                    {step === "signing" ? "Waiting for signature..." : "Processing..."}
                  </Text>
                </Flex>
              ) : (
                "Deposit with Freighter"
              )}
            </Button>

            {step === "error" && (
              <Button
                variant="ghost"
                size="sm"
                color="app.muted"
                onClick={() => {
                  setStep("idle");
                  setLocalError(null);
                  lockMutation.reset();
                }}
              >
                Try again
              </Button>
            )}
          </Flex>
        </ModalBody>
      </ModalContent>
    </Modal>
  );
}

export default function Farm() {
  const { publicKey, isConnected, isNetworkMismatch } = useStellarWallet();
  const toast = useToast();

  // Signal to AppShell that this page renders its own inline Connect Wallet
  // button inside the "My Earnings" section when the wallet is disconnected,
  // so the global floating CTA is suppressed (Issue #69).
  const signalOwnCTA = useOwnConnectButton();
  useEffect(() => {
    signalOwnCTA(!isConnected);
    return () => signalOwnCTA(false);
  }, [isConnected, signalOwnCTA]);

  const {
    data: pools,
    isLoading: poolsLoading,
    isError: poolsError,
    error: poolsErrorObj,
  } = usePools();

  const {
    data: userPositions,
    isLoading: positionsLoading,
    isError: positionsError,
    error: positionsErrorObj,
  } = useAllUserPositions();

  const poolContractIds = useMemo(
    () => (pools ?? []).map((p) => p.contractAddress).filter(Boolean),
    [pools],
  );

  useSorobanEvents(poolContractIds, [
    "lock_assets",
    "unlock_assets",
    "update_credits",
  ]);

  const [selectedFarm, setSelectedFarm] = useState<LivePoolRow | null>(null);
  const [isDepositOpen, setIsDepositOpen] = useState(false);

  useEffect(() => {
    if (poolsError && poolsErrorObj) {
      toast({
        title: "Unable to load pools",
        description:
          poolsErrorObj instanceof Error
            ? poolsErrorObj.message
            : "Failed to fetch pool data from Soroban",
        status: "error",
        duration: 8000,
        isClosable: true,
      });
    }
  }, [poolsError, poolsErrorObj, toast]);

  useEffect(() => {
    if (positionsError && positionsErrorObj) {
      toast({
        title: "Unable to load positions",
        description:
          positionsErrorObj instanceof Error
            ? positionsErrorObj.message
            : "Failed to fetch user positions from Soroban",
        status: "error",
        duration: 8000,
        isClosable: true,
      });
    }
  }, [positionsError, positionsErrorObj, toast]);

  const myPositions = useMemo<FarmPosition[]>(() => {
    if (!userPositions) return [];
    return userPositions.map(({ pool, position }) => ({
      id: pool.id,
      contractAddress: pool.contractAddress,
      name: pool.asset.code,
      img: "",
      earned: position?.credits ?? "-",
      stake: position?.amount ?? "-",
      dailyRate: pool.dailyRate,
      totalStakedLiquidity: `$${Number(pool.totalLocked).toLocaleString()}`,
      symbol: pool.asset.code,
      lockedAmount: position?.amount ? Number(position.amount) : 0,
      lockedAt: position?.lockedAt ?? 0,
      lockPeriodSeconds: position ? pool.minLockPeriod : minLockPeriodSeconds,
    }));
  }, [userPositions]);

  const availablePools = useMemo<LivePoolRow[]>(() => {
    if (!pools) return [];
    const positionMap = new Map<string, UserPosition | null>();
    userPositions?.forEach((item) => positionMap.set(item.pool.id, item.position));

    return pools.map((pool) => {
      const position = positionMap.get(pool.id);
      return {
        id: pool.id,
        contractAddress: pool.contractAddress,
        name: pool.asset.code,
        earned: position?.credits ?? "-",
        stake: position?.amount ?? "-",
        dailyRate: pool.dailyRate,
        totalStakedLiquidity: `$${Number(pool.totalLocked).toLocaleString()}`,
        symbol: pool.asset.code,
        lockedAmount: position?.amount ? Number(position.amount) : 0,
        lockedAt: position?.lockedAt ?? 0,
        lockPeriodSeconds: pool.minLockPeriod,
      };
    });
  }, [pools, userPositions]);

  const handleDepositClick = (pool: LivePoolRow) => {
    setSelectedFarm(pool);
    setIsDepositOpen(true);
  };

  const handleDepositClose = () => {
    setIsDepositOpen(false);
    setSelectedFarm(null);
  };

  const hasPositions = myPositions.length > 0;

  return (
    <Flex direction="column" align="center" gap={6} px={{ base: 4, md: 8 }} py={6}>
      <PlatformStats />
      <Text fontSize="xs" color="app.muted" textAlign="center" overflowWrap="anywhere">
        Network: {stellarNetwork}
        {publicKey ? ` - ${publicKey.slice(0, 6)}...` : ""}
        {factoryContractId
          ? ` - Factory ${factoryContractId.slice(0, 8)}...`
          : " - Set NEXT_PUBLIC_FACTORY_CONTRACT_ID when your Soroban factory is deployed"}
        {" - "}
        {sorobanRpcUrl.replace(/^https?:\/\//, "")}
      </Text>

      <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="extrabold" letterSpacing="tight" w="full" maxW="1200px">
        Farm Pools
      </Text>

      {poolsLoading ? (
        <Flex w="100%" justify="center" py={16}>
          <Spinner size="xl" color={ACCENT} />
        </Flex>
      ) : availablePools.length === 0 ? (
        <Alert status="info" borderRadius="2xl" w="95%" maxW="1200px">
          <AlertIcon />
          No farm pools are currently available. Ensure your factory contract is deployed and configured.
        </Alert>
      ) : (
        <Flex direction="column" gap={3} w="full" maxW="1200px">
          {availablePools.map((farm) => (
            <Flex
              key={farm.id}
              display={{ base: "flex", md: "flex" }}
              flexDirection={{ base: "column", md: "row" }}
              w="full"
              minH={20}
              align={{ base: "stretch", md: "center" }}
              justify={{ base: "flex-start", md: "space-between" }}
              gap={{ base: 4, md: 0 }}
              border="1px solid"
              borderColor="app.border"
              borderRadius="card"
              bg="app.surface"
              boxShadow="card"
              transition="all 0.2s ease"
              _hover={{ borderColor: "app.borderHover", boxShadow: "cardHover" }}
              px={5}
              py={{ base: 4, md: 0 }}
            >
              <NextLink href={`/farm/${farm.id}`} style={{ textDecoration: "none" }}>
                <Text
                  fontWeight="bold"
                  w={{ base: "full", md: "auto" }}
                  _hover={{ color: "app.accent" }}
                  cursor="pointer"
                >
                  {farm.name}
                </Text>
              </NextLink>
              <MetricColumn label="Earned" value={farm.earned} />
              <MetricColumn label="My Stake" value={farm.stake} />
              <MetricColumn label="Daily Rate" value={farm.dailyRate} />
              <MetricColumn
                label="Total Staked Liquidity"
                value={farm.totalStakedLiquidity}
                minW="180px"
              />
              {isConnected && (
                <Button
                  borderRadius="3xl"
                  bg="app.accent"
                  color="app.onAccent"
                  _hover={{ opacity: 0.9 }}
                  onClick={() => handleDepositClick(farm)}
                  isDisabled={isNetworkMismatch}
                  w={{ base: "full", md: "auto" }}
                >
                  + Deposit
                </Button>
              )}
            </Flex>
          ))}
        </Flex>
      )}

      <Text fontSize={{ base: "2xl", md: "3xl" }} fontWeight="extrabold" letterSpacing="tight" mt={10} w="full" maxW="1200px">
        My Earnings
      </Text>

      {positionsLoading ? (
        <Flex w="100%" justify="center" py={16}>
          <Spinner size="xl" color={ACCENT} />
        </Flex>
      ) : !isConnected ? (
        <Alert
          status="info"
          borderRadius="2xl"
          w={{ base: "full", md: "95%" }}
          maxW="1200px"
          flexDirection={{ base: "column", md: "row" }}
          alignItems={{ base: "stretch", md: "center" }}
          gap={{ base: 3, md: 4 }}
        >
          <Flex
            flex="1"
            direction={{ base: "column", md: "row" }}
            align={{ base: "stretch", md: "center" }}
            justify="space-between"
            gap={4}
          >
            <Flex align="center" gap={2}>
              <AlertIcon m={0} />
              <Text>Connect your Freighter wallet to view your positions.</Text>
            </Flex>
            <ConnectWalletButton
              label="Connect Wallet"
              position="static"
              bottom="auto"
              right="auto"
              left="auto"
              w={{ base: "full", md: "auto" }}
            />
          </Flex>
        </Alert>
      ) : !hasPositions ? (
        <Alert status="info" borderRadius="2xl" w={{ base: "full", md: "95%" }} maxW="1200px">
          <AlertIcon />
          No active positions found for the connected wallet.
        </Alert>
      ) : (
        <Flex direction="column" gap={3} w="full" maxW="1200px">
          {myPositions.map((position) => (
            <EarningRow key={position.id} position={position} />
          ))}
        </Flex>
      )}

      <DepositModal
        farm={selectedFarm}
        isOpen={isDepositOpen}
        onClose={handleDepositClose}
      />
      <UnlockModal />
    </Flex>
  );
}

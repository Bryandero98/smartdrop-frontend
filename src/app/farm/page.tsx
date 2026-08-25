"use client";

import { PlatformStats } from "@/components/PlatformStats/PlatformStats";
import ConnectWalletButton from "@/components/ConnectWalletButton/ConnectWalletButton";
import UnlockModal from "@/components/UnlockModal/UnlockModal";
import BoostModal from "@/components/BoostModal/BoostModal";
import { EarningRow, MetricColumn } from "@/app/farm/EarningRow";
import { FarmPoolRow } from "@/app/farm/FarmPoolRow";
import {
  factoryContractId,
  minLockPeriodSeconds,
  sorobanRpcUrl,
  stellarNetwork,
} from "@/config";
import { useStellarWallet } from "@/context/StellarWalletContext";
import {
  useAllUserPositions,
  useLockAssetsFeePreview,
  usePools,
  useStellarBalance,
} from "@/hooks/useSorobanQuery";
import { useLockFlow } from "@/hooks/useLockFlow";
import { useSorobanEvents } from "@/hooks/useSorobanEvents";
import { stellarExpertTxUrl } from "@/lib/soroban";
import type { UserPosition } from "@/lib/soroban";
import {
  DEPOSIT_STEP_LABEL,
  isDepositPending,
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
  const { publicKey, walletApi, isConnected, isNetworkMismatch } = useStellarWallet();
  const [amount, setAmount] = useState("");

  const selectedContractAddress = farm?.contractAddress || farm?.id || "";
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

  // #83: Use the shared useLockFlow hook instead of useLockAssets directly,
  // ensuring consistent analytics (deposit_initiated/succeeded/failed) and
  // cache invalidation across both farm-list and pool-detail entry points.
  const flow = useLockFlow({
    poolId: selectedContractAddress,
    symbol: farm?.symbol ?? "",
    publicKey: publicKey ?? "",
    walletApi,
  });

  const isFeeSponsored =
    isConnected &&
    typeof availableBalance === "number" &&
    availableBalance < 1.0 &&
    !!process.env.NEXT_PUBLIC_FEE_SPONSOR_PUBLIC_KEY;

  const isPending = isDepositPending(flow.step);
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
      flow.reset();
    }
    // Reset only when the modal opens or the selected pool changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, farm?.id]);

  const resetAndClose = () => {
    setAmount("");
    flow.reset();
    onClose();
  };

  const handleClose = () => {
    if (isPending) return;
    resetAndClose();
  };

  const handleSubmit = async () => {
    if (!farm || !publicKey || !amountValid) return;
    await flow.execute(numericAmount);
  };

  // Auto-close the modal shortly after a successful deposit.
  useEffect(() => {
    if (flow.step === "success") {
      const timer = setTimeout(resetAndClose, 1500);
      return () => clearTimeout(timer);
    }
  }, [flow.step]);

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
                aria-live="polite"
                aria-atomic="true"
              >
                <Spinner size="sm" color="app.accent" />
                <Text fontSize="sm" color="app.muted">
                  {DEPOSIT_STEP_LABEL[flow.step] || "Processing deposit..."}
                </Text>
              </Flex>
            )}

            {flow.record?.txHash && (
              <Box border="1px solid" borderColor="app.border" borderRadius="2xl" p={3}>
                <Flex justify="space-between" fontSize="sm" gap={4}>
                  <Text color="app.muted">Transaction</Text>
                  <Link
                    href={stellarExpertTxUrl(flow.record.txHash, stellarNetwork.toLowerCase())}
                    isExternal
                    color="app.accent"
                    fontFamily="mono"
                  >
                    {shortHash(flow.record.txHash)}
                  </Link>
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

            {flow.error && (
              <Alert status="error" borderRadius="2xl" bg="#2a1414" color="#ff8080" aria-live="assertive" aria-atomic="true">
                <AlertIcon color="#ff8080" />
                {flow.error}
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
                    {flow.step === "signing" ? "Waiting for signature..." : "Processing..."}
                  </Text>
                </Flex>
              ) : (
                "Deposit with Freighter"
              )}
            </Button>

            {flow.step === "error" && (
              <Button
                variant="ghost"
                size="sm"
                color="app.muted"
                onClick={flow.reset}
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
      boostAllocation: position?.boostAllocation,
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
        boostAllocation: position?.boostAllocation,
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
            <FarmPoolRow
              key={farm.id}
              farm={farm}
              isConnected={isConnected}
              isNetworkMismatch={isNetworkMismatch}
              onDeposit={handleDepositClick}
            />
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
      <BoostModal />
    </Flex>
  );
}

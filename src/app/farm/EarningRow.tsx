"use client";

import { stellarNetwork } from "@/config";
import { useStellarWallet } from "@/context/StellarWalletContext";
import { useCountdown } from "@/hooks/useCountdown";
import { formatCredits } from "@/lib/soroban";
import { useFarmStore } from "@/store/farmStore";
import {
  type FarmPosition,
  unlockAvailableAt,
} from "@/types/farm";
import {
  Box,
  Button,
  Flex,
  Text,
  Tooltip,
} from "@chakra-ui/react";
import { memo, type ReactNode } from "react";

export function MetricColumn({
  label,
  value,
  minW = "110px",
}: {
  label: string;
  value: ReactNode;
  minW?: string;
}) {
  return (
    <Flex
      direction="column"
      minW={{ base: 0, md: minW }}
      w={{ base: "full", md: "auto" }}
      align={{ base: "stretch", md: "flex-start" }}
      gap={1}
    >
      <Text fontSize="2xs" color="app.muted" textTransform="uppercase">
        {label}
      </Text>
      <Text fontWeight={{ base: "semibold", md: "normal" }} overflowWrap="anywhere">
        {value}
      </Text>
    </Flex>
  );
}

type EarningRowProps = {
  position: FarmPosition;
};

function earningRowPropsAreEqual(
  previous: EarningRowProps,
  next: EarningRowProps,
) {
  const previousPosition = previous.position;
  const nextPosition = next.position;

  return (
    previousPosition.id === nextPosition.id &&
    previousPosition.contractAddress === nextPosition.contractAddress &&
    previousPosition.name === nextPosition.name &&
    previousPosition.img === nextPosition.img &&
    previousPosition.earned === nextPosition.earned &&
    previousPosition.stake === nextPosition.stake &&
    previousPosition.dailyRate === nextPosition.dailyRate &&
    previousPosition.totalStakedLiquidity === nextPosition.totalStakedLiquidity &&
    previousPosition.symbol === nextPosition.symbol &&
    previousPosition.lockedAmount === nextPosition.lockedAmount &&
    previousPosition.lockedAt === nextPosition.lockedAt &&
    previousPosition.lockPeriodSeconds === nextPosition.lockPeriodSeconds
  );
}

export const EarningRow = memo(function EarningRow({
  position,
}: EarningRowProps) {
  const openUnlock = useFarmStore((s) => s.openUnlock);
  const { isNetworkMismatch } = useStellarWallet();
  const countdown = useCountdown(unlockAvailableAt(position));
  const hasStake = position.lockedAmount > 0;
  const canUnlock = hasStake && countdown.isElapsed;
  const boostUnavailable = true;
  const unlockDisabled = !canUnlock || isNetworkMismatch;
  const unlockTooltipLabel = isNetworkMismatch
    ? `Switch Freighter to ${stellarNetwork} to unlock.`
    : !hasStake
      ? "No locked assets in this position"
      : `Locked for another ${countdown.label}`;

  return (
    <Flex
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
      <Text fontWeight="bold" w={{ base: "full", md: "auto" }}>
        {position.name}
      </Text>
      <MetricColumn label="Earned" value={formatCredits(position.earned)} />
      <MetricColumn label="My Stake" value={position.stake} />
      <MetricColumn label="Daily Rate" value={position.dailyRate} />
      <MetricColumn
        label="Total Staked Liquidity"
        value={position.totalStakedLiquidity}
        minW="180px"
      />
      {hasStake && (
        <Box
          display="block"
          w={{ base: "full", md: "auto" }}
          minW={{ md: "150px" }}
          textAlign="center"
          border="1px solid"
          borderColor="app.border"
          borderRadius="2xl"
          bg="app.inputBg"
          px={3}
          py={3}
        >
          <Text fontSize="2xs" color="app.muted" textTransform="uppercase">
            Unlock status
          </Text>
          <Text fontSize="lg" fontWeight="bold">
            {countdown.label}
          </Text>
        </Box>
      )}
      <Flex
        gap={{ base: 3, md: 4 }}
        direction={{ base: "column", md: "row" }}
        w={{ base: "full", md: "auto" }}
      >
        <Button
          borderRadius="3xl"
          variant="outline"
          borderColor="app.border"
          color="app.muted"
          isDisabled={isNetworkMismatch || boostUnavailable}
          opacity={0.6}
          cursor="not-allowed"
          _hover={{ opacity: 0.6 }}
          w={{ base: "full", md: "auto" }}
        >
          Boost
        </Button>
        <Tooltip
          label={unlockTooltipLabel}
          isDisabled={!unlockDisabled}
          hasArrow
          bg="app.tooltipBg"
          color="app.tooltipFg"
        >
          <Box w={{ base: "full", md: "auto" }}>
            <Button
              borderRadius="3xl"
              bg="app.accent"
              color="app.onAccent"
              _hover={{ opacity: 0.9 }}
              onClick={() => openUnlock(position)}
              isDisabled={unlockDisabled}
              w={{ base: "full", md: "auto" }}
            >
              Unlock
            </Button>
          </Box>
        </Tooltip>
      </Flex>
    </Flex>
  );
}, earningRowPropsAreEqual);

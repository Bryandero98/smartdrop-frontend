"use client";

import NextLink from "next/link";
import { Button, Flex, Text } from "@chakra-ui/react";
import { MetricColumn } from "./EarningRow";
import { memo } from "react";

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

type FarmPoolRowProps = {
  farm: LivePoolRow;
  isConnected: boolean;
  isNetworkMismatch: boolean;
  onDeposit: (farm: LivePoolRow) => void;
};

function farmPoolRowPropsAreEqual(
  previous: FarmPoolRowProps,
  next: FarmPoolRowProps,
) {
  return (
    previous.farm.id === next.farm.id &&
    previous.farm.name === next.farm.name &&
    previous.farm.earned === next.farm.earned &&
    previous.farm.stake === next.farm.stake &&
    previous.farm.dailyRate === next.farm.dailyRate &&
    previous.farm.totalStakedLiquidity === next.farm.totalStakedLiquidity &&
    previous.farm.symbol === next.farm.symbol &&
    previous.farm.lockedAmount === next.farm.lockedAmount &&
    previous.farm.lockedAt === next.farm.lockedAt &&
    previous.farm.lockPeriodSeconds === next.farm.lockPeriodSeconds &&
    previous.isConnected === next.isConnected &&
    previous.isNetworkMismatch === next.isNetworkMismatch
  );
}

export const FarmPoolRow = memo(function FarmPoolRow({
  farm,
  isConnected,
  isNetworkMismatch,
  onDeposit,
}: FarmPoolRowProps) {
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
          onClick={() => onDeposit(farm)}
          isDisabled={isNetworkMismatch}
          w={{ base: "full", md: "auto" }}
        >
          + Deposit
        </Button>
      )}
    </Flex>
  );
}, farmPoolRowPropsAreEqual);

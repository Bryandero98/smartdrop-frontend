"use client";

import { useState } from "react";
import {
  Badge,
  Box,
  Flex,
  HStack,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { listAirdrops, backendQueryRetry } from "@/lib/backend";
import { QueryErrorAlert } from "@/components/QueryErrorAlert/QueryErrorAlert";

function statusColor(status: string) {
  switch (status) {
    case "completed":
      return "green";
    case "executing":
      return "blue";
    case "cancelled":
    case "failed":
      return "red";
    default:
      return "gray";
  }
}

export default function AirdropsPage() {
  const [page] = useState(1);

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["airdrops", page],
    queryFn: () => listAirdrops(page, 20),
    ...backendQueryRetry,
  });

  return (
    <Flex direction="column" align="center" px={{ base: 6, md: 16 }} py={10} gap={8}>
      <Box w="100%" maxW="1000px">
        <HStack spacing={2} mb={5}>
          <Box w="6px" h="6px" borderRadius="full" bg="app.accent" boxShadow="0 0 8px var(--chakra-colors-app-accent)" />
          <Text fontSize="xs" fontWeight="semibold" letterSpacing="wide" color="app.muted" textTransform="uppercase">
            Campaigns
          </Text>
        </HStack>
        <Text
          fontSize={{ base: "4xl", md: "5xl" }}
          fontWeight="extrabold"
          letterSpacing="tight"
          mb={3}
          bgGradient="linear(to-r, app.text, app.accent)"
          bgClip="text"
        >
          Airdrops
        </Text>
        <Text color="app.muted" fontSize="lg">
          Bulk distribution campaigns run by SmartDrop, separate from the on-chain farming pools.
        </Text>
      </Box>

      <Box w="100%" maxW="1000px">
        {isLoading ? (
          <Flex justify="center" py={16}>
            <Spinner color="app.accent" size="xl" thickness="3px" />
          </Flex>
        ) : isError ? (
          <QueryErrorAlert
            error={error}
            onRetry={() => refetch()}
            isRetrying={isFetching}
            fallbackMessage="Failed to load airdrops"
          />
        ) : !data || data.airdrops.length === 0 ? (
          <Flex
            justify="center"
            py={16}
            border="1px dashed"
            borderColor="app.border"
            borderRadius="card"
            bg="app.surface"
          >
            <Text color="app.muted">No airdrops have been created yet.</Text>
          </Flex>
        ) : (
          <Flex direction="column" gap={3}>
            {data.airdrops.map((airdrop) => (
              <Flex
                key={airdrop.id}
                justify="space-between"
                align={{ base: "flex-start", md: "center" }}
                direction={{ base: "column", md: "row" }}
                gap={3}
                p={5}
                border="1px solid"
                borderColor="app.border"
                borderRadius="card"
                bg="app.surface"
                boxShadow="card"
                transition="all 0.2s ease"
                _hover={{ borderColor: "app.borderHover", boxShadow: "cardHover" }}
              >
                <Box>
                  <Text fontWeight="bold" fontSize="lg">{airdrop.name}</Text>
                  <Text fontSize="sm" color="app.muted" fontFamily="mono">
                    {airdrop.total_amount.toLocaleString()} {airdrop.asset} · expires at ledger {airdrop.expiry_ledger.toLocaleString()}
                  </Text>
                </Box>
                <Badge colorScheme={statusColor(airdrop.status)} borderRadius="full" px={3} py={1} textTransform="capitalize">
                  {airdrop.status}
                </Badge>
              </Flex>
            ))}
          </Flex>
        )}
        {data && data.pagination.total > 0 && (
          <Text fontSize="xs" color="app.muted" mt={4}>
            {data.pagination.total} airdrop{data.pagination.total === 1 ? "" : "s"} total
          </Text>
        )}
      </Box>
    </Flex>
  );
}

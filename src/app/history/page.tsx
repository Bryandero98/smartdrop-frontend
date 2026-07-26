"use client";

import { useEffect, useState } from "react";
import {
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Link,
  Spinner,
  Table,
  TableContainer,
  Tbody,
  Td,
  Text,
  Th,
  Thead,
  Tr,
} from "@chakra-ui/react";
import { useStellarWallet } from "@/context/StellarWalletContext";
import ConnectWalletButton from "@/components/ConnectWalletButton/ConnectWalletButton";
import LiveRegion from "@/components/LiveRegion/LiveRegion";
import { useLiveAnnouncer } from "@/hooks/useLiveAnnouncer";
import {
  getUserTransactionHistory,
  stellarExpertTxUrl,
  type TxHistoryEntry,
} from "@/lib/soroban";
import { poolContractId, stellarNetwork } from "@/config";

const PAGE_SIZE = 20;

function truncateHash(hash: string): string {
  if (hash.length <= 12) return hash;
  return `${hash.slice(0, 8)}…${hash.slice(-6)}`;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function formatAmount(amount: string, symbol: string): string {
  const num = parseFloat(amount);
  if (isNaN(num)) return `${amount} ${symbol}`;
  return `${(num / 1e7).toLocaleString(undefined, { maximumFractionDigits: 4 })} ${symbol}`;
}

function EmptyState({ children }: { children: React.ReactNode }) {
  return (
    <Flex
      direction="column"
      align="center"
      gap={4}
      w="100%"
      maxW="1000px"
      mt={10}
      py={16}
      border="1px dashed"
      borderColor="app.border"
      borderRadius="card"
      bg="app.surface"
    >
      {children}
    </Flex>
  );
}

export default function HistoryPage() {
  const { publicKey, isConnected } = useStellarWallet();
  const [entries, setEntries] = useState<TxHistoryEntry[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [page, setPage] = useState(1);

  const poolContractIds = poolContractId ? [poolContractId] : [];

  useEffect(() => {
    if (!publicKey || poolContractIds.length === 0) return;
    setIsLoading(true);
    setPage(1);
    getUserTransactionHistory(publicKey, poolContractIds)
      .then(setEntries)
      .finally(() => setIsLoading(false));
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publicKey]);

  const totalPages = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const paged = entries.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const rangeStart = entries.length === 0 ? 0 : (page - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(page * PAGE_SIZE, entries.length);
  const announcementMessage =
    !isConnected || isLoading
      ? ""
      : entries.length === 0
        ? "No farming history found."
        : `History updated, showing ${rangeStart}-${rangeEnd} of ${entries.length.toLocaleString()} transactions.`;
  const announcement = useLiveAnnouncer(announcementMessage);

  return (
    <Flex direction="column" align="center" px={{ base: 6, md: 16 }} py={10} gap={2}>
      <LiveRegion message={announcement} />
      <Box w="100%" maxW="1000px" mb={4}>
        <HStack spacing={2} mb={5}>
          <Box w="6px" h="6px" borderRadius="full" bg="app.accent" boxShadow="0 0 8px var(--chakra-colors-app-accent)" />
          <Text fontSize="xs" fontWeight="semibold" letterSpacing="wide" color="app.muted" textTransform="uppercase">
            Activity
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
          History
        </Text>
        <Text color="app.muted" fontSize="lg">
          Your past lock and unlock events across SmartDrop pools.
        </Text>
      </Box>

      {!isConnected ? (
        <EmptyState>
          <Text color="app.muted">Connect your wallet to view your farming history.</Text>
          <ConnectWalletButton position="static" bottom="auto" right="auto" left="auto" />
        </EmptyState>
      ) : isLoading ? (
        <Flex w="100%" justify="center" py={16}>
          <Spinner color="app.accent" size="xl" thickness="3px" />
        </Flex>
      ) : entries.length === 0 ? (
        <EmptyState>
          <Text color="app.muted" textAlign="center">
            No farming history yet — deposit to a pool to get started.
          </Text>
        </EmptyState>
      ) : (
        <>
          <TableContainer
            w="100%"
            maxW="1000px"
            mt={6}
            overflowX="auto"
            border="1px solid"
            borderColor="app.border"
            borderRadius="card"
            bg="app.surface"
            boxShadow="card"
          >
            <Table variant="unstyled" size="sm">
              <Thead>
                <Tr borderBottom="1px solid" borderColor="app.border">
                  <Th color="app.muted" fontWeight="medium" py={4} pl={5}>Date</Th>
                  <Th color="app.muted" fontWeight="medium" py={4}>Action</Th>
                  <Th color="app.muted" fontWeight="medium" py={4} isNumeric>Amount</Th>
                  <Th color="app.muted" fontWeight="medium" py={4} isNumeric>Credits Earned</Th>
                  <Th color="app.muted" fontWeight="medium" py={4} pr={5}>Transaction</Th>
                </Tr>
              </Thead>
              <Tbody>
                {paged.map((entry) => (
                  <Tr
                    key={entry.txHash}
                    borderTop="1px solid"
                    borderColor="app.border"
                    _hover={{ bg: "app.surfaceHover" }}
                    transition="background 0.15s ease"
                  >
                    <Td py={4} pl={5} color="app.text" whiteSpace="nowrap">
                      {formatDate(entry.date)}
                    </Td>
                    <Td py={4}>
                      <Badge
                        colorScheme={entry.action === "lock" ? "green" : "yellow"}
                        borderRadius="full"
                        px={2.5}
                        py={0.5}
                        textTransform="capitalize"
                        fontWeight="semibold"
                      >
                        {entry.action}
                      </Badge>
                    </Td>
                    <Td py={4} isNumeric color="app.text">
                      {formatAmount(entry.amount, entry.symbol)}
                    </Td>
                    <Td py={4} isNumeric color="app.text">
                      {entry.creditsEarned != null
                        ? Number(entry.creditsEarned).toLocaleString()
                        : "—"}
                    </Td>
                    <Td py={4} pr={5}>
                      <Link
                        href={stellarExpertTxUrl(entry.txHash, stellarNetwork.toLowerCase())}
                        isExternal
                        color="app.accent"
                        fontFamily="mono"
                        fontSize="xs"
                        _hover={{ textDecoration: "underline" }}
                      >
                        {truncateHash(entry.txHash)}
                      </Link>
                    </Td>
                  </Tr>
                ))}
              </Tbody>
            </Table>
          </TableContainer>

          {totalPages > 1 && (
            <Flex gap={2} mt={6} align="center" wrap="wrap" justify="center">
              <Button
                size="sm"
                borderRadius="2xl"
                variant="outline"
                borderColor="app.border"
                color="app.text"
                isDisabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
                _hover={{ borderColor: "app.accent", color: "app.accent" }}
              >
                Prev
              </Button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map((p) => (
                <Button
                  key={p}
                  size="sm"
                  borderRadius="2xl"
                  variant={p === page ? "solid" : "outline"}
                  bg={p === page ? "app.accent" : undefined}
                  color={p === page ? "app.onAccent" : "app.text"}
                  borderColor="app.border"
                  onClick={() => setPage(p)}
                  _hover={{
                    borderColor: "app.accent",
                    color: p === page ? "app.onAccent" : "app.accent",
                  }}
                >
                  {p}
                </Button>
              ))}

              <Button
                size="sm"
                borderRadius="2xl"
                variant="outline"
                borderColor="app.border"
                color="app.text"
                isDisabled={page === totalPages}
                onClick={() => setPage((p) => p + 1)}
                _hover={{ borderColor: "app.accent", color: "app.accent" }}
              >
                Next
              </Button>
            </Flex>
          )}

          {page === totalPages && entries.length >= PAGE_SIZE && (
            <Button
              mt={6}
              mb={8}
              size="sm"
              borderRadius="2xl"
              variant="outline"
              borderColor="app.border"
              color="app.text"
              isDisabled
            >
              No more entries
            </Button>
          )}

          <Text fontSize="xs" color="app.muted" mt={4} mb={8}>
            Showing events from the past 7 days
          </Text>
        </>
      )}
    </Flex>
  );
}

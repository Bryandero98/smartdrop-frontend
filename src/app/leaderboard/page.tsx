"use client";

import {
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Select,
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
import { useLeaderboard, PAGE_SIZE, type SortKey } from "@/hooks/useLeaderboard";
import { useLiveAnnouncer } from "@/hooks/useLiveAnnouncer";
import LiveRegion from "@/components/LiveRegion/LiveRegion";

const LEADERBOARD_TABLE_ID = "leaderboard-table";

const SORT_LABELS: Record<SortKey, string> = {
  credits: "Credits",
  stake: "Stake",
};

function truncate(addr: string): string {
  if (addr.length <= 12) return addr;
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

export default function LeaderboardPage() {
  const { publicKey } = useStellarWallet();
  const {
    paged,
    isLoading,
    sortKey,
    setSortKey,
    searchQuery,
    setSearchQuery,
    currentPage,
    totalPages,
    setPage,
    connectedRank,
    filteredCount,
    lastRefreshed,
    refresh,
  } = useLeaderboard(publicKey);

  // Matches the spinner-vs-table branch below: nothing to announce yet
  // while the very first fetch is still in flight.
  const isInitialLoad = isLoading && paged.length === 0;
  const rangeStart = filteredCount === 0 ? 0 : (currentPage - 1) * PAGE_SIZE + 1;
  const rangeEnd = Math.min(currentPage * PAGE_SIZE, filteredCount);
  const announcementMessage = isInitialLoad
    ? ""
    : filteredCount === 0
      ? "No results found."
      : `Leaderboard updated, sorted by ${SORT_LABELS[sortKey]}, showing rank ${rangeStart}-${rangeEnd} of ${filteredCount.toLocaleString()}.`;
  const announcement = useLiveAnnouncer(announcementMessage);

  return (
    <Flex direction="column" align="center" px={{ base: 6, md: 16 }} py={10}>
      <LiveRegion message={announcement} />
      <Box w="100%" maxW="900px">
        <HStack spacing={2} mb={5}>
          <Box w="6px" h="6px" borderRadius="full" bg="app.accent" boxShadow="0 0 8px var(--chakra-colors-app-accent)" />
          <Text fontSize="xs" fontWeight="semibold" letterSpacing="wide" color="app.muted" textTransform="uppercase">
            Rankings
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
          Leaderboard
        </Text>
        {connectedRank > 0 ? (
          <Text color="app.accent" fontSize="lg" fontWeight="semibold">
            You are rank {connectedRank} of {filteredCount} farmers.
          </Text>
        ) : (
          <Text color="app.muted" fontSize="lg">
            {filteredCount.toLocaleString()} farmers ranked.
          </Text>
        )}
      </Box>

      <Flex
        direction={{ base: "column", md: "row" }}
        gap={3}
        w="100%"
        maxW="900px"
        my={6}
        align={{ base: "stretch", md: "center" }}
        justify="space-between"
      >
        <Input
          placeholder="Search address…"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          maxW={{ base: "100%", md: "280px" }}
          borderRadius="2xl"
          borderColor="app.border"
          bg="app.inputBg"
          color="app.text"
          _placeholder={{ color: "app.muted" }}
          _hover={{ borderColor: "app.accent" }}
          _focus={{ boxShadow: "none", borderColor: "app.accent" }}
        />

        <Flex gap={2} align="center">
          <Select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            aria-controls={LEADERBOARD_TABLE_ID}
            aria-label="Sort leaderboard by"
            borderRadius="2xl"
            borderColor="app.border"
            bg="app.surface"
            color="app.text"
            maxW="180px"
            _hover={{ borderColor: "app.accent" }}
            _focus={{ boxShadow: "none", borderColor: "app.accent" }}
          >
            <option value="credits">Sort: Credits</option>
            <option value="stake">Sort: Stake</option>
          </Select>

          <Button
            onClick={refresh}
            borderRadius="2xl"
            size="sm"
            isDisabled={isLoading}
            variant="outline"
            borderColor="app.border"
            color="app.text"
            _hover={{ borderColor: "app.accent", color: "app.accent" }}
          >
            {isLoading ? <Spinner size="xs" /> : "Refresh"}
          </Button>
        </Flex>
      </Flex>

      {isLoading && paged.length === 0 ? (
        <Flex w="100%" justify="center" py={16}>
          <Spinner color="app.accent" size="xl" thickness="3px" />
        </Flex>
      ) : filteredCount === 0 ? (
        <Flex
          w="100%"
          maxW="900px"
          justify="center"
          py={16}
          border="1px dashed"
          borderColor="app.border"
          borderRadius="card"
          bg="app.surface"
        >
          <Text color="app.muted">No results found.</Text>
        </Flex>
      ) : (
        <>
          <TableContainer
            w="100%"
            maxW="900px"
            overflowX="auto"
            border="1px solid"
            borderColor="app.border"
            borderRadius="card"
            bg="app.surface"
            boxShadow="card"
          >
            <Table id={LEADERBOARD_TABLE_ID} variant="unstyled" size="sm">
              <Thead>
                <Tr borderBottom="1px solid" borderColor="app.border">
                  <Th color="app.muted" fontWeight="medium" py={4} pl={5}>#</Th>
                  <Th color="app.muted" fontWeight="medium" py={4}>Address</Th>
                  <Th
                    color="app.muted"
                    fontWeight="medium"
                    py={4}
                    px={0}
                    isNumeric
                    aria-sort={sortKey === "credits" ? "descending" : "none"}
                  >
                    <Button
                      variant="unstyled"
                      onClick={() => setSortKey("credits")}
                      display="flex"
                      alignItems="center"
                      justifyContent="flex-end"
                      gap={1}
                      ml="auto"
                      minW="auto"
                      h="auto"
                      color="inherit"
                      fontWeight="inherit"
                      fontSize="inherit"
                      textTransform="inherit"
                      _hover={{ color: "app.accent" }}
                      _focusVisible={{
                        outline: "2px solid",
                        outlineColor: "app.accent",
                        outlineOffset: "2px",
                      }}
                    >
                      Credits
                      {sortKey === "credits" && <Text as="span" fontSize="10px">▼</Text>}
                    </Button>
                  </Th>
                  <Th
                    color="app.muted"
                    fontWeight="medium"
                    py={4}
                    px={0}
                    isNumeric
                    aria-sort={sortKey === "stake" ? "descending" : "none"}
                  >
                    <Button
                      variant="unstyled"
                      onClick={() => setSortKey("stake")}
                      display="flex"
                      alignItems="center"
                      justifyContent="flex-end"
                      gap={1}
                      ml="auto"
                      minW="auto"
                      h="auto"
                      color="inherit"
                      fontWeight="inherit"
                      fontSize="inherit"
                      textTransform="inherit"
                      _hover={{ color: "app.accent" }}
                      _focusVisible={{
                        outline: "2px solid",
                        outlineColor: "app.accent",
                        outlineOffset: "2px",
                      }}
                    >
                      Stake
                      {sortKey === "stake" && <Text as="span" fontSize="10px">▼</Text>}
                    </Button>
                  </Th>
                  <Th color="app.muted" fontWeight="medium" py={4} pr={5} isNumeric>Boost %</Th>
                </Tr>
              </Thead>
              <Tbody>
                {paged.map((entry, i) => {
                  const rank = (currentPage - 1) * PAGE_SIZE + i + 1;
                  const isMe = Boolean(publicKey && entry.address === publicKey);
                  const medal = rank === 1 ? "🥇" : rank === 2 ? "🥈" : rank === 3 ? "🥉" : null;
                  return (
                    <Tr
                      key={entry.address}
                      borderTop="1px solid"
                      borderColor="app.border"
                      bg={isMe ? "rgba(74,226,146,0.08)" : undefined}
                      _hover={{ bg: "app.surfaceHover" }}
                      transition="background 0.15s ease"
                    >
                      <Td
                        py={4}
                        pl={5}
                        color={rank <= 3 ? "app.accent" : "app.text"}
                        fontWeight={rank <= 3 ? "bold" : "normal"}
                      >
                        <HStack spacing={1.5}>
                          {medal && <Text as="span">{medal}</Text>}
                          <Text as="span">{rank}</Text>
                        </HStack>
                      </Td>
                      <Td py={4}>
                        <Flex align="center" gap={2}>
                          <Text fontFamily="mono" color="app.text">
                            {truncate(entry.address)}
                          </Text>
                          {isMe && (
                            <Text
                              fontSize="xs"
                              fontWeight="bold"
                              color="app.onAccent"
                              bg="app.accent"
                              borderRadius="full"
                              px={2}
                              py={0.5}
                            >
                              YOU
                            </Text>
                          )}
                        </Flex>
                      </Td>
                      <Td py={4} isNumeric color="app.text" fontWeight="semibold">
                        {entry.totalCredits.toLocaleString()}
                      </Td>
                      <Td py={4} isNumeric color="app.text">
                        {entry.totalStake.toLocaleString()}
                      </Td>
                      <Td py={4} pr={5} isNumeric color="app.text">
                        {entry.boostUtilization}%
                      </Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </Table>
          </TableContainer>

          <Flex gap={2} mt={6} align="center" wrap="wrap" justify="center">
            <Button
              size="sm"
              borderRadius="2xl"
              variant="outline"
              borderColor="app.border"
              color="app.text"
              isDisabled={currentPage === 1}
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
                variant={p === currentPage ? "solid" : "outline"}
                bg={p === currentPage ? "app.accent" : undefined}
                color={p === currentPage ? "app.onAccent" : "app.text"}
                borderColor="app.border"
                onClick={() => setPage(p)}
                _hover={{
                  borderColor: "app.accent",
                  color: p === currentPage ? "app.onAccent" : "app.accent",
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
              isDisabled={currentPage === totalPages}
              onClick={() => setPage((p) => p + 1)}
              _hover={{ borderColor: "app.accent", color: "app.accent" }}
            >
              Next
            </Button>
          </Flex>

          {lastRefreshed && (
            <Text fontSize="xs" color="app.muted" mt={4} mb={8}>
              Updated {lastRefreshed.toLocaleTimeString()} · auto-refreshes
              every 30s
            </Text>
          )}
        </>
      )}
    </Flex>
  );
}

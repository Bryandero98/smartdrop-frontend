"use client";

import { useState } from "react";
import {
  Alert,
  AlertIcon,
  Badge,
  Box,
  Button,
  Flex,
  HStack,
  Input,
  Spinner,
  Text,
} from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { getPrice, backendQueryRetry } from "@/lib/backend";
import { QueryErrorAlert } from "@/components/QueryErrorAlert/QueryErrorAlert";

function formatUsd(value: number | null) {
  if (value === null) return "—";
  return value.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  });
}

export default function PricesPage() {
  const [assetCode, setAssetCode] = useState("XLM");
  const [issuer, setIssuer] = useState("");
  const [submitted, setSubmitted] = useState({ assetCode: "XLM", issuer: "" });

  const { data, isLoading, isError, error, isFetching, refetch } = useQuery({
    queryKey: ["price", submitted.assetCode, submitted.issuer],
    queryFn: () => getPrice(submitted.assetCode, submitted.issuer || undefined),
    enabled: !!submitted.assetCode,
    ...backendQueryRetry,
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitted({ assetCode: assetCode.trim().toUpperCase(), issuer: issuer.trim() });
  };

  return (
    <Flex direction="column" align="center" px={{ base: 6, md: 16 }} py={10} gap={8}>
      <Box w="100%" maxW="800px">
        <HStack spacing={2} mb={5}>
          <Box w="6px" h="6px" borderRadius="full" bg="app.accent" boxShadow="0 0 8px var(--chakra-colors-app-accent)" />
          <Text fontSize="xs" fontWeight="semibold" letterSpacing="wide" color="app.muted" textTransform="uppercase">
            Price oracle
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
          Prices
        </Text>
        <Text color="app.muted" fontSize="lg">
          Live USD prices for Stellar assets, aggregated from the DEX orderbook, CoinGecko, and CoinMarketCap.
        </Text>
      </Box>

      <Box
        as="form"
        onSubmit={handleSubmit}
        w="100%"
        maxW="800px"
        border="1px solid"
        borderColor="app.border"
        borderRadius="card"
        bg="app.surface"
        boxShadow="card"
        p={6}
      >
        <Flex gap={3} direction={{ base: "column", md: "row" }} align={{ md: "flex-end" }}>
          <Box flex={1}>
            <Text fontSize="sm" color="app.muted" mb={1}>Asset code</Text>
            <Input
              value={assetCode}
              onChange={(e) => setAssetCode(e.target.value)}
              placeholder="XLM, USDC…"
              borderColor="app.border"
              bg="app.inputBg"
              _hover={{ borderColor: "app.accent" }}
              _focus={{ boxShadow: "none", borderColor: "app.accent" }}
            />
          </Box>
          <Box flex={2}>
            <Text fontSize="sm" color="app.muted" mb={1}>Issuer (optional, not needed for XLM)</Text>
            <Input
              value={issuer}
              onChange={(e) => setIssuer(e.target.value)}
              placeholder="G..."
              fontFamily="mono"
              fontSize="sm"
              borderColor="app.border"
              bg="app.inputBg"
              _hover={{ borderColor: "app.accent" }}
              _focus={{ boxShadow: "none", borderColor: "app.accent" }}
            />
          </Box>
          <Button type="submit" bg="app.accent" color="app.onAccent" _hover={{ opacity: 0.9 }} isLoading={isFetching}>
            Look up
          </Button>
        </Flex>
      </Box>

      <Box w="100%" maxW="800px">
        {isLoading ? (
          <Flex justify="center" py={10}>
            <Spinner color="app.accent" size="xl" thickness="3px" />
          </Flex>
        ) : isError ? (
          <QueryErrorAlert
            error={error}
            onRetry={() => refetch()}
            isRetrying={isFetching}
            fallbackMessage="Failed to fetch price"
          />
        ) : data ? (
          <Box
            border="1px solid"
            borderColor="app.border"
            borderRadius="card"
            bg="app.surface"
            boxShadow="card"
            p={6}
          >
            <HStack justify="space-between" mb={4} flexWrap="wrap">
              <Text fontSize="2xl" fontWeight="bold">{data.asset_code}</Text>
              <Badge colorScheme={data.is_stale ? "yellow" : "green"} borderRadius="full" px={3} py={1}>
                {data.is_stale ? "Stale" : "Fresh"}
              </Badge>
            </HStack>
            <Text fontSize="4xl" fontWeight="extrabold" color="app.accent" mb={2}>
              {formatUsd(data.price_usd)}
            </Text>
            <Text fontSize="sm" color="app.muted" mb={1}>
              Source: {data.source} · fetched {new Date(data.fetched_at).toLocaleString()}
            </Text>
            {data.stale_warning && (
              <Alert status="warning" borderRadius="lg" mt={3} fontSize="sm">
                <AlertIcon />
                {data.stale_warning}
              </Alert>
            )}
            <Text fontSize="xs" color="app.muted" mt={4}>
              Sources attempted: {data.sources_attempted.join(", ") || "none"}
            </Text>
          </Box>
        ) : null}
      </Box>
    </Flex>
  );
}

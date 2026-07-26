"use client";
import { useEffect } from "react";
import {
  Flex,
  HStack,
  Text,
  Spinner,
  Box,
  useToast,
  Alert,
  AlertIcon,
} from "@chakra-ui/react";
import { motion } from "framer-motion";
import { useStellarWallet } from "@/context/StellarWalletContext";
import {
  usePlatformStats,
  useTotalUserCredits,
} from "@/hooks/useSorobanQuery";
import { sorobanRpcUrl, stellarNetwork } from "@/config";

const MotionBox = motion.create(Box);

const fadeInUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (delay = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.5, ease: "easeOut", delay },
  }),
};

function StatCard({
  label,
  value,
  accent = "app.accent",
  delay = 0,
}: {
  label: string;
  value: string | number;
  accent?: string;
  delay?: number;
}) {
  return (
    <MotionBox
      variants={fadeInUp}
      initial="hidden"
      animate="visible"
      custom={delay}
      w={["100%", "48%", "23%"]}
      position="relative"
      overflow="hidden"
      border="1px solid"
      borderColor="app.border"
      borderRadius="card"
      p={6}
      bg="app.surface"
      boxShadow="card"
      sx={{ transition: "border-color 0.2s ease, box-shadow 0.2s ease, transform 0.2s ease" }}
      _hover={{
        borderColor: "app.borderHover",
        boxShadow: "cardHover",
        transform: "translateY(-2px)",
      }}
    >
      <Box
        position="absolute"
        top={0}
        left={0}
        right={0}
        h="3px"
        bgGradient={`linear(to-r, ${accent}, transparent)`}
      />
      <Text color="app.muted" fontSize="sm" mb={2} fontWeight="medium">
        {label}
      </Text>
      <Text fontSize="3xl" fontWeight="extrabold" color={accent}>
        {value}
      </Text>
    </MotionBox>
  );
}

export default function Home() {
  const toast = useToast();
  const { publicKey, isConnected } = useStellarWallet();
  const {
    data: stats,
    isLoading: statsLoading,
    isError: statsError,
    error: statsErrorObj,
  } = usePlatformStats();

  const {
    data: totalCredits,
    isLoading: creditsLoading,
    isError: creditsError,
    error: creditsErrorObj,
  } = useTotalUserCredits();

  useEffect(() => {
    if (statsError && statsErrorObj) {
      toast({
        title: "Unable to load platform data",
        description:
          statsErrorObj instanceof Error
            ? statsErrorObj.message
            : "Failed to fetch dashboard data",
        status: "error",
        duration: 8000,
        isClosable: true,
      });
    }
  }, [statsError, statsErrorObj, toast]);

  useEffect(() => {
    if (creditsError && creditsErrorObj) {
      toast({
        title: "Unable to load credits",
        description:
          creditsErrorObj instanceof Error
            ? creditsErrorObj.message
            : "Failed to fetch user credits",
        status: "error",
        duration: 8000,
        isClosable: true,
      });
    }
  }, [creditsError, creditsErrorObj, toast]);

  const formatNumber = (value: number | undefined | null, fallback = "Not tracked") =>
    value || value === 0 ? value.toLocaleString() : fallback;

  return (
    <Flex direction="column" px={{ base: 6, md: 16 }} py={10} align="center" gap={10}>
      <MotionBox variants={fadeInUp} initial="hidden" animate="visible" w="100%" maxW="1200px">
        <HStack
          spacing={2}
          mb={5}
          display="inline-flex"
          borderRadius="full"
          border="1px solid"
          borderColor="app.border"
          bg="app.surface"
          backdropFilter="blur(12px)"
          px={3}
          py={1.5}
        >
          <Box
            w="6px"
            h="6px"
            borderRadius="full"
            bg="app.accent"
            boxShadow="0 0 8px var(--chakra-colors-app-accent)"
            className="animate-pulse"
          />
          <Text fontSize="xs" fontWeight="semibold" letterSpacing="wide" color="app.muted" textTransform="uppercase">
            Live on {stellarNetwork}
          </Text>
        </HStack>
        <Text
          fontSize={{ base: "4xl", md: "5xl" }}
          fontWeight="extrabold"
          letterSpacing="tight"
          mb={4}
          bgGradient="linear(to-r, app.text, app.accent)"
          bgClip="text"
        >
          SmartDrop Dashboard
        </Text>
        <Text color="app.muted" mb={4} fontSize="lg" maxW="640px">
          Live Soroban RPC data with contract-driven TVL, pool counts, and user
          metrics.
        </Text>
        <Text fontSize="sm" color="app.muted" mb={2} fontFamily="mono">
          RPC: {sorobanRpcUrl.replace(/^https?:\/\//, "")}
          {publicKey ? ` · Wallet ${publicKey.slice(0, 6)}…` : ""}
        </Text>
      </MotionBox>

      <Flex direction="row" w="100%" maxW="1200px" flexWrap="wrap" gap={4}>
        {statsLoading ? (
          <Flex w="100%" justify="center" py={16}>
            <Spinner size="xl" color="app.accent" thickness="3px" />
          </Flex>
        ) : (
          <>
            <StatCard
              label="Total Value Locked"
              value={stats?.totalValueLocked ?? "Not available"}
              delay={0.05}
            />
            <StatCard
              label="Active Pools"
              value={stats?.totalPools ?? "No pools found"}
              accent="app.accent2"
              delay={0.1}
            />
            <StatCard
              label="Total Users"
              value={formatNumber(stats?.totalUsers)}
              delay={0.15}
            />
            <StatCard
              label="Users Online"
              value={formatNumber(stats?.onlineUsers)}
              accent="app.accent2"
              delay={0.2}
            />
          </>
        )}
      </Flex>

      <MotionBox
        variants={fadeInUp}
        initial="hidden"
        animate="visible"
        custom={0.25}
        w="100%"
        maxW="1200px"
        border="1px solid"
        borderColor="app.border"
        borderRadius="card"
        p={8}
        bg="app.surface"
        boxShadow="card"
      >
        <Text fontSize="2xl" fontWeight="bold" mb={3}>
          Your credits
        </Text>
        <Text color="app.muted" mb={4}>
          Credits are calculated from your on-chain positions across all pools.
        </Text>

        {isConnected ? (
          creditsLoading ? (
            <Spinner size="lg" color="app.accent" />
          ) : (
            <Text fontSize="4xl" fontWeight="extrabold" color="app.accent">
              {totalCredits ?? "0"} Credits
            </Text>
          )
        ) : (
          <Alert status="info" borderRadius="xl" bg="app.surfaceHover">
            <AlertIcon /> Connect your Freighter wallet to fetch your user credits and positions.
          </Alert>
        )}
      </MotionBox>
    </Flex>
  );
}

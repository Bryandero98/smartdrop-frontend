import type { Metadata } from "next";
import { Avatar, Box, Flex, Grid, HStack, Link as ChakraLink, Text } from "@chakra-ui/react";
import NextLink from "next/link";

import contributorData from "@/data/contributors.json";

export const metadata: Metadata = {
  title: "Contributors",
  description: "The people building SmartDrop across the frontend, backend, and Soroban contracts.",
};

export default function ContributorsPage() {
  const rows = contributorData.contributors;
  const sorted = [...rows].sort(
    (a, b) => b.contributions - a.contributions || a.login.localeCompare(b.login),
  );
  const totalContributions = sorted.reduce((sum, c) => sum + c.contributions, 0);

  return (
    <Flex direction="column" align="center" px={{ base: 6, md: 16 }} py={10} gap={10}>
      <Box w="100%" maxW="1100px">
        <HStack spacing={2} mb={5}>
          <Box w="6px" h="6px" borderRadius="full" bg="app.accent" boxShadow="0 0 8px var(--chakra-colors-app-accent)" />
          <Text fontSize="xs" fontWeight="semibold" letterSpacing="wide" color="app.muted" textTransform="uppercase">
            SmartDropLabs org
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
          Contributors
        </Text>
        <Text color="app.muted" fontSize="lg" maxW="640px">
          {sorted.length} people shipping SmartDrop across the{" "}
          <ChakraLink as={NextLink} href="https://github.com/SmartDropLabs/smartdrop-frontend" isExternal color="app.accent">frontend</ChakraLink>,{" "}
          <ChakraLink as={NextLink} href="https://github.com/SmartDropLabs/smartdrop-backend" isExternal color="app.accent">backend</ChakraLink>, and{" "}
          <ChakraLink as={NextLink} href="https://github.com/SmartDropLabs/smartdrop-contracts" isExternal color="app.accent">Soroban contracts</ChakraLink>{" "}
          repos — {totalContributions.toLocaleString()} commits and counting.
        </Text>
      </Box>

      <Grid
        w="100%"
        maxW="1100px"
        templateColumns={{ base: "minmax(0, 1fr)", sm: "repeat(2, minmax(0, 1fr))", lg: "repeat(3, minmax(0, 1fr))" }}
        gap={4}
      >
        {sorted.map((c, i) => (
          <ChakraLink
            key={c.login}
            as={NextLink}
            href={c.html_url}
            target="_blank"
            rel="noreferrer"
            minW={0}
            _hover={{ textDecoration: "none" }}
          >
            <Flex
              align="center"
              gap={3}
              p={4}
              minW={0}
              border="1px solid"
              borderColor="app.border"
              borderRadius="card"
              bg="app.surface"
              boxShadow="card"
              transition="all 0.2s ease"
              _hover={{ borderColor: "app.borderHover", boxShadow: "cardHover", transform: "translateY(-2px)" }}
            >
              <Avatar src={c.avatar_url} name={c.login} size="md" flexShrink={0} />
              <Box minW={0} flex={1}>
                <Text fontWeight="semibold" color="app.text" isTruncated>
                  @{c.login}
                </Text>
                <Text fontSize="sm" color="app.muted">
                  {c.contributions} commit{c.contributions === 1 ? "" : "s"}
                </Text>
              </Box>
              {i < 3 && (
                <Box
                  flexShrink={0}
                  fontSize="xs"
                  fontWeight="bold"
                  color="app.onAccent"
                  bg="app.accent"
                  borderRadius="full"
                  px={2}
                  py={0.5}
                >
                  #{i + 1}
                </Box>
              )}
            </Flex>
          </ChakraLink>
        ))}
      </Grid>
    </Flex>
  );
}

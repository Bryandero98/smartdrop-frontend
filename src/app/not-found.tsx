import { Button, Flex, Text } from "@chakra-ui/react";
import NextLink from "next/link";

export default function NotFound() {
  return (
    <Flex
      direction="column"
      align="center"
      justify="center"
      textAlign="center"
      gap={4}
      px={6}
      py={24}
      minH="60vh"
    >
      <Text
        fontSize={{ base: "5xl", md: "7xl" }}
        fontWeight="extrabold"
        letterSpacing="tight"
        bgGradient="linear(to-r, app.text, app.accent)"
        bgClip="text"
      >
        404
      </Text>
      <Text fontSize="xl" fontWeight="semibold" color="app.text">
        This page doesn&apos;t exist
      </Text>
      <Text color="app.muted" maxW="440px">
        The link you followed may be broken, or the page may have moved.
      </Text>
      <Button as={NextLink} href="/" colorScheme="green" bg="app.accent" mt={2}>
        Back to home
      </Button>
    </Flex>
  );
}

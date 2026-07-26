import { Flex, Link as ChakraLink, Text } from "@chakra-ui/react";
import NextLink from "next/link";

export default function Footer() {
  return (
    <Flex
      as="footer"
      w={{ base: "full", md: "95%" }}
      maxW="1400px"
      align="center"
      justify={{ base: "center", md: "space-between" }}
      direction={{ base: "column", md: "row" }}
      gap={{ base: 2, md: 0 }}
      borderTop="1px solid"
      borderColor="app.border"
      py={6}
      mx="auto"
      mt={8}
      px={{ base: 4, md: 0 }}
      fontSize="sm"
      color="app.muted"
    >
      <Text px={{ base: 0, md: 8 }} fontWeight="semibold" color="app.text">SmartDrop</Text>
      <ChakraLink
        as={NextLink}
        href="/contributors"
        px={{ base: 0, md: 8 }}
        color="app.muted"
        _hover={{ color: "app.accent" }}
        fontSize="sm"
        textAlign="center"
        overflowWrap="anywhere"
      >
        Contributors
      </ChakraLink>
      <Text px={{ base: 0, md: 8 }}>© 2026</Text>
    </Flex>
  );
}

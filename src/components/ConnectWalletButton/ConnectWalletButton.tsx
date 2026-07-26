"use client";

import { useErrorHandler } from "@/context/ErrorContext";
import { useStellarWallet } from "@/context/StellarWalletContext";
import { Button, Flex, Text, Tooltip, type ButtonProps } from "@chakra-ui/react";
import { useState } from "react";

const ACCENT = "#4AE292";

type ConnectWalletButtonProps = ButtonProps & {
  label?: string;
};

function truncateKey(key: string): string {
  return `${key.slice(0, 4)}...${key.slice(-4)}`;
}

export default function ConnectWalletButton({
  label = "Connect Freighter",
  ...buttonProps
}: ConnectWalletButtonProps) {
  const { connect, disconnect, publicKey, isConnected } = useStellarWallet();
  const toast = useErrorHandler();
  const [isConnecting, setIsConnecting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await connect();
      toast.success("Wallet connected", "Freighter is now linked to SmartDrop");
    } catch (error) {
      toast.handleError(error, "Wallet Connection");
    } finally {
      setIsConnecting(false);
    }
  };

  const handleCopy = async () => {
    if (!publicKey) return;
    try {
      await navigator.clipboard.writeText(publicKey);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard may be unavailable in hardened browser contexts.
    }
  };

  if (isConnected && publicKey) {
    return (
      <Flex
        align="center"
        gap={2}
        position="fixed"
        bottom={{ base: "16px", md: "20px" }}
        right={{ base: "16px", md: "20px" }}
        left={{ base: "16px", md: "auto" }}
        w={{ base: "calc(100% - 32px)", md: "auto" }}
        justify={{ base: "center", md: "flex-start" }}
        bg="#1a1a1a"
        border="1px solid #333"
        borderRadius="3xl"
        px={4}
        py={2}
      >
        <Tooltip
          label={copied ? "Copied!" : publicKey}
          hasArrow
          bg="#222"
          color="#fff"
          fontSize="xs"
        >
          <Text
            fontSize="sm"
            fontFamily="mono"
            color={ACCENT}
            cursor="pointer"
            onClick={() => void handleCopy()}
            _hover={{ opacity: 0.8 }}
            userSelect="none"
          >
            {truncateKey(publicKey)}
          </Text>
        </Tooltip>
        <Text color="#555" fontSize="xs">
          |
        </Text>
        <Text
          fontSize="xs"
          color="#A2A2A2"
          cursor="pointer"
          _hover={{ color: "#fff" }}
          onClick={disconnect}
          userSelect="none"
        >
          Disconnect
        </Text>
      </Flex>
    );
  }

  return (
    <Button
      bgColor={ACCENT}
      color="#000"
      borderRadius="3xl"
      position="fixed"
      bottom={{ base: "16px", md: "20px" }}
      right={{ base: "16px", md: "20px" }}
      left={{ base: "16px", md: "auto" }}
      w={{ base: "calc(100% - 32px)", md: "auto" }}
      px={6}
      py={4}
      fontWeight="bold"
      transition="box-shadow 0.2s ease, opacity 0.2s ease"
      _hover={{ opacity: 0.9, boxShadow: "glow" }}
      {...buttonProps}
      onClick={() => void handleConnect()}
      isLoading={isConnecting || Boolean(buttonProps.isLoading)}
      loadingText={buttonProps.loadingText ?? "Connecting..."}
    >
      {label}
    </Button>
  );
}

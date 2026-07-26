"use client";

import { stellarNetwork } from "@/config";
import { useStellarWallet } from "@/context/StellarWalletContext";
import { Alert, AlertIcon } from "@chakra-ui/react";

export default function NetworkMismatchBanner() {
  const { isNetworkMismatch, networkName } = useStellarWallet();

  if (!isNetworkMismatch || !networkName) return null;

  return (
    <Alert
      status="warning"
      position="sticky"
      top={{ base: "auto", md: "80px" }}
      zIndex={10}
      borderRadius={0}
      justifyContent="center"
      color="app.text"
    >
      <AlertIcon />
      Freighter is set to {networkName}. Switch to {stellarNetwork} to use
      SmartDrop.
    </Alert>
  );
}

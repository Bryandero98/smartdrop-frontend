"use client";

import ConnectWalletButton from "@/components/ConnectWalletButton/ConnectWalletButton";
import Footer from "@/components/Footer/Footer";
import Navbar from "@/components/Navbar/Navbar";
import NetworkMismatchBanner from "@/components/NetworkMismatchBanner/NetworkMismatchBanner";
import ContextProvider from "@/context";
import {
  OwnConnectButtonProvider,
  useHasOwnConnectButton,
} from "@/context/OwnConnectButtonContext";
import { useStellarWallet } from "@/context/StellarWalletContext";
import { Box } from "@chakra-ui/react";
import { usePathname } from "next/navigation";

// Routes where the page itself always renders an inline Connect Wallet button
// in the disconnected state — no dynamic condition, just pathname matching.
// Dynamic routes (/farm/[poolId]) are handled via OwnConnectButtonContext
// because the inline CTA there is conditional (only inside the deposit modal).
const STATIC_OWN_CONNECT_ROUTES = ["/history"];

function LayoutWrapper({ children }: { children: React.ReactNode }) {
  const { isConnected } = useStellarWallet();
  const pathname = usePathname();

  // Pages signal a dynamic own-CTA via context (e.g. /farm, /farm/[poolId]).
  const hasContextCTA = useHasOwnConnectButton();

  // /history always renders its own inline button; no context needed.
  const hasStaticCTA = STATIC_OWN_CONNECT_ROUTES.includes(pathname ?? "");

  const hasOwnConnectButton = hasContextCTA || hasStaticCTA;

  return (
    <Box
      display="flex"
      flexDirection="column"
      minH="100vh"
      bg="app.bg"
      color="app.text"
    >
      <Navbar />
      <NetworkMismatchBanner />
      {isConnected ? (
        <>
          <Box as="main" flex={1}>{children}</Box>
          <Footer />
        </>
      ) : (
        <>
          <Box
            as="main"
            flex={1}
            pb={{ base: hasOwnConnectButton ? 0 : "88px", md: 0 }}
          >
            {children}
          </Box>
          {!hasOwnConnectButton && <ConnectWalletButton />}
        </>
      )}
    </Box>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <ContextProvider>
      {/* OwnConnectButtonProvider must be inside ContextProvider so the
          wallet context is available to children, but it wraps LayoutWrapper
          so pages can signal upward before the floating button is rendered. */}
      <OwnConnectButtonProvider>
        <LayoutWrapper>{children}</LayoutWrapper>
      </OwnConnectButtonProvider>
    </ContextProvider>
  );
}

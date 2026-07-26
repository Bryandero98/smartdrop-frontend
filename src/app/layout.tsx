import AppShell from "@/components/AppShell/AppShell";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { CSP_POLICY } from "../../next.config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

export const metadata: Metadata = {
  title: {
    default: "SmartDrop — Stellar Liquidity Farming",
    template: "%s · SmartDrop",
  },
  description: "Stellar-based liquidity-oriented airdrop experiment",
  other: {
    "Content-Security-Policy": CSP_POLICY,
  },
};

export const viewport: Viewport = {
  themeColor: "#0b0d0c",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className={inter.className} suppressHydrationWarning>
      <head>
        <meta httpEquiv="Content-Security-Policy" content={CSP_POLICY} />
      </head>
      <body suppressHydrationWarning>
        <AppShell>{children}</AppShell>
      </body>
    </html>
  );
}

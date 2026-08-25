import AppShell from "@/components/AppShell/AppShell";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import { CSP_POLICY } from "../../next.config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], display: "swap" });

const SITE_NAME = "SmartDrop";
const SITE_TITLE = "SmartDrop — Stellar Liquidity Farming";
const SITE_DESCRIPTION = "Stellar-based liquidity-oriented airdrop experiment";

export const metadata: Metadata = {
  title: {
    default: SITE_TITLE,
    template: "%s · SmartDrop",
  },
  description: SITE_DESCRIPTION,
  openGraph: {
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
    siteName: SITE_NAME,
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: SITE_TITLE,
    description: SITE_DESCRIPTION,
  },
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

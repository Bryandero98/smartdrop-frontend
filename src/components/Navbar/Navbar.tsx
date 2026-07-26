"use client";

import {
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
} from "@chakra-ui/react";
import { ChevronDownIcon } from "@chakra-ui/icons";
import { useStellarWallet } from "@/context/StellarWalletContext";
import NextLink from "next/link";
import { usePathname } from "next/navigation";
import ThemeToggle from "@/components/ThemeToggle/ThemeToggle";

const MORE_LINKS = [
  { href: "/prices", label: "Prices" },
  { href: "/airdrops", label: "Airdrops" },
  { href: "/webhooks", label: "Webhooks" },
  { href: "/alerts", label: "Alerts" },
];

function shortenStellarAddress(address: string) {
  if (!address || address.length < 12) {
    return address;
  }
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

function Logo() {
  return (
    <NextLink href="/" className="flex items-center gap-2 hover:opacity-85">
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-[#6dffb8] to-[#0f7a4e]">
        <div className="h-2.5 w-2.5 rotate-45 rounded-sm bg-[#0b0d0c]" />
      </div>
      <span className="text-lg font-extrabold tracking-tight text-[color:var(--chakra-colors-app-text)]">
        SmartDrop
      </span>
    </NextLink>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  const pathname = usePathname();
  const isActive = pathname === href;
  return (
    <NextLink
      href={href}
      className={`text-sm transition-colors hover:text-[color:var(--chakra-colors-app-accent)] ${
        isActive
          ? "font-semibold text-[color:var(--chakra-colors-app-accent)]"
          : "font-medium text-[color:var(--chakra-colors-app-text)]"
      }`}
    >
      {children}
    </NextLink>
  );
}

function MoreMenu() {
  const pathname = usePathname();
  const isActive = MORE_LINKS.some((link) => link.href === pathname);
  return (
    <Menu>
      <MenuButton
        fontSize="sm"
        fontWeight={isActive ? "semibold" : "medium"}
        color={isActive ? "app.accent" : "app.text"}
        _hover={{ color: "app.accent" }}
        transition="color 0.15s ease"
      >
        More <ChevronDownIcon />
      </MenuButton>
      <MenuList bg="app.surface" borderColor="app.border">
        {MORE_LINKS.map((link) => (
          <MenuItem
            key={link.href}
            as={NextLink}
            href={link.href}
            bg="app.surface"
            color={pathname === link.href ? "app.accent" : "app.text"}
            _hover={{ bg: "app.surfaceHover" }}
          >
            {link.label}
          </MenuItem>
        ))}
      </MenuList>
    </Menu>
  );
}

function StatPill({ label, value, pulse = false }: { label: string; value: string; pulse?: boolean }) {
  return (
    <div className="flex items-center gap-1.5 rounded-full border border-[color:var(--chakra-colors-app-border)] bg-[color:var(--chakra-colors-app-surface)] px-3 py-1 text-xs whitespace-nowrap">
      {pulse && (
        <span className="h-1.5 w-1.5 shrink-0 animate-pulse rounded-full bg-[color:var(--chakra-colors-app-accent)]" />
      )}
      <span className="text-[color:var(--chakra-colors-app-muted)]">{label}</span>
      <span className="font-bold text-[color:var(--chakra-colors-app-text)]">{value}</span>
    </div>
  );
}

export default function Navbar() {
  const { isConnected, publicKey } = useStellarWallet();

  return (
    <nav
      className="sticky top-0 z-20 w-full border-b backdrop-blur-md"
      style={{
        backgroundColor: "color-mix(in srgb, var(--chakra-colors-app-bg) 80%, transparent)",
        borderColor: "var(--chakra-colors-app-border)",
      }}
    >
      <div className="mx-auto flex w-full max-w-[1400px] flex-col gap-3 px-4 py-4 lg:h-20 lg:min-h-20 lg:w-[95%] lg:flex-row lg:items-center lg:justify-between lg:gap-4 lg:px-0 lg:py-0">
        <div className="flex w-full items-center justify-between lg:w-auto">
          <Logo />
          <div className="block lg:hidden">
            <ThemeToggle />
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-4 lg:gap-7">
          <NavLink href="/">Home</NavLink>
          {isConnected && <NavLink href="/farm">Farm</NavLink>}
          <NavLink href="/history">History</NavLink>
          {isConnected && <NavLink href="/leaderboard">Leaderboard</NavLink>}
          <NavLink href="/contributors">Contributors</NavLink>
          <MoreMenu />
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {isConnected && publicKey ? (
            <StatPill label="Wallet" value={shortenStellarAddress(publicKey)} />
          ) : (
            <>
              <StatPill label="Online" value="213" pulse />
              <StatPill label="Users" value="30,738" />
              <StatPill label="TVL" value="$302M" />
            </>
          )}
          <div className="hidden lg:block">
            <ThemeToggle />
          </div>
        </div>
      </div>
    </nav>
  );
}

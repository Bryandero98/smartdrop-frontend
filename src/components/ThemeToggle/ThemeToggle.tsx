"use client";

import { IconButton, useColorMode } from "@chakra-ui/react";

function SunMoonIcon({ isDark }: { isDark: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M20.5 14.5A8.5 8.5 0 1 1 9.5 3.5a7 7 0 0 0 11 11Z"
        fill="currentColor"
        opacity={isDark ? 1 : 0}
        style={{ transition: "opacity 0.25s ease" }}
      />
      <g opacity={isDark ? 0 : 1} style={{ transition: "opacity 0.25s ease" }}>
        <circle cx="12" cy="12" r="4.5" fill="currentColor" />
        <path
          d="M12 2v2.5M12 19.5V22M22 12h-2.5M4.5 12H2M19.07 4.93l-1.77 1.77M6.7 17.3l-1.77 1.77M19.07 19.07l-1.77-1.77M6.7 6.7 4.93 4.93"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
        />
      </g>
    </svg>
  );
}

export default function ThemeToggle() {
  const { colorMode, toggleColorMode } = useColorMode();
  const isDark = colorMode === "dark";

  return (
    <IconButton
      aria-label="Toggle colour mode"
      icon={<SunMoonIcon isDark={isDark} />}
      onClick={toggleColorMode}
      variant="ghost"
      size="sm"
      color="app.text"
      _hover={{ bg: "app.surfaceHover", color: "app.accent" }}
    />
  );
}

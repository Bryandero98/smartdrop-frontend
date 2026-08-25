import { extendTheme, type ThemeConfig } from "@chakra-ui/react";

const config: ThemeConfig = {
  initialColorMode: "dark",
  useSystemColorMode: false,
};

const theme = extendTheme({
  config,
  fonts: {
    heading: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
    body: `'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif`,
  },
  semanticTokens: {
    colors: {
      // Page-level backgrounds
      "app.bg":        { default: "#ffffff",  _dark: "#0b0d0c" },
      "app.surface":   { default: "#f5f5f5",  _dark: "#141716" },
      "app.surfaceHover": { default: "#eeeeee", _dark: "#181c1b" },
      "app.inputBg":   { default: "#ffffff",  _dark: "#121212" },
      // Borders
      "app.border":    { default: "#d0d0d0",  _dark: "#2a2f2d" },
      "app.borderHover": { default: "#0f7a4e", _dark: "#4ae292" },
      // Accent — #0f7a4e passes 4.5:1 on white; #4ae292 is the dark-mode green
      "app.accent":    { default: "#0f7a4e",  _dark: "#4ae292" },
      "app.accent2":   { default: "#2563eb",  _dark: "#6dd5ff" },
      // Text
      "app.text":      { default: "#171717",  _dark: "#ffffff" },
      "app.muted":     { default: "#6b7280",  _dark: "#9a9a9a" },
      "app.onAccent":  { default: "#ffffff",  _dark: "#000000" },
      // Tooltip
      "app.tooltipBg": { default: "#f0f0f0",  _dark: "#222222" },
      "app.tooltipFg": { default: "#171717",  _dark: "#ffffff" },
      // Alerts — error: #b3261e passes 4.5:1 on #fdecec; #ff8080 passes 4.5:1 on #2a1414
      "app.errorBg":   { default: "#fdecec",  _dark: "#2a1414" },
      "app.errorFg":   { default: "#b3261e",  _dark: "#ff8080" },
      // Alerts — warning: #8a5a00 passes 4.5:1 on #fdf3e2; #f6c453 passes 4.5:1 on #2a2412
      "app.warningBg": { default: "#fdf3e2",  _dark: "#2a2412" },
      "app.warningFg": { default: "#8a5a00",  _dark: "#f6c453" },
      // Alerts — fee-sponsored warning: #9a6b00 passes 4.5:1 on #fef3cd; #ffb86c passes 4.5:1 on #2d2216
      "app.feeWarnBg":     { default: "#fef3cd", _dark: "#2d2216" },
      "app.feeWarnFg":     { default: "#9a6b00", _dark: "#ffb86c" },
      "app.feeWarnBorder": { default: "#c9a84c", _dark: "#7c5c24" },
    },
  },
  styles: {
    global: {
      "html, body": {
        scrollBehavior: "smooth",
      },
    },
  },
  shadows: {
    card: "0 1px 2px rgba(0,0,0,0.04), 0 8px 24px -8px rgba(0,0,0,0.35)",
    cardHover: "0 1px 2px rgba(0,0,0,0.06), 0 16px 40px -12px rgba(74,226,146,0.25)",
    glow: "0 0 0 1px rgba(74,226,146,0.4), 0 0 32px rgba(74,226,146,0.25)",
  },
  radii: {
    card: "1.25rem",
  },
});

export default theme;

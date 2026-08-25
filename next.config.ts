import type { NextConfig } from "next";
import withBundleAnalyzer from "@next/bundle-analyzer";
import { validateEnv } from "./src/config/validateEnv";

const raw = process.env.BASE_PATH?.trim() ?? "";
const basePath = raw.startsWith("/") ? raw : raw ? `/${raw}` : "";

/**
 * NEXT_EXPORT=true → static export for GitHub Pages (no API routes).
 * Unset (default) → server mode for Vercel / `next start` (API routes active).
 *
 * The /api/stats route caches TVL data server-side every 60 s.
 * When running in static-export mode the frontend hook falls back to querying
 * the Stellar Horizon API directly from the browser.
 */
const isStaticExport = process.env.NEXT_EXPORT === "true";

// Fail the build immediately on missing/malformed env vars instead of
// silently falling back to demo mode or a runtime 500 (issue #199).
//
// Netlify sets CONTEXT to "production" | "deploy-preview" | "branch-deploy"
// (unset locally and in most other CI). Preview/branch-deploy builds don't
// necessarily carry production Soroban config, and previously fell into
// silent demo mode the same as any other missing-config build — so those
// contexts warn instead of failing the build. Local dev/build and the
// production context stay strict.
const netlifyContext = process.env.CONTEXT;
const isNetlifyPreview = netlifyContext === "deploy-preview" || netlifyContext === "branch-deploy";
validateEnv({ isStaticExport, strict: !isNetlifyPreview });
const backendApiOrigin = (() => {
  try {
    return new URL(
      process.env.NEXT_PUBLIC_BACKEND_API_URL ?? "http://localhost:4000/api/v1"
    ).origin;
  } catch {
    return "http://localhost:4000";
  }
})();

const CSP_POLICY = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-eval' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  `connect-src 'self' https://horizon.stellar.org https://horizon-testnet.stellar.org https://soroban-testnet.stellar.org https://soroban.stellar.org https://stellar.expert ${backendApiOrigin}`,
  "img-src 'self' data: https:",
  "font-src 'self'",
  "frame-src 'none'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  images: {
    unoptimized: true,
  },
  ...(isStaticExport ? { output: "export" } : {}),
  devIndicators: false,
  ...(basePath ? { basePath, assetPrefix: basePath } : {}),
};

export default withBundleAnalyzer({ enabled: process.env.ANALYZE === "true" })(nextConfig);
export { CSP_POLICY };

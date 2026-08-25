/**
 * Build/dev-start-time env var sanity checks (issue #199).
 *
 * Previously nothing validated NEXT_PUBLIC_FACTORY_CONTRACT_ID,
 * NEXT_PUBLIC_SOROBAN_RPC_URL, STELLAR_FEE_SPONSOR_SECRET, etc. — a missing
 * or malformed value silently produced empty/zero stats or a runtime 500
 * instead of a build-time diagnostic. This prints clear warnings for
 * anything misconfigured; it deliberately does not fail the build, since
 * some of these are legitimately optional depending on deployment mode
 * (e.g. the static-export path has no API routes, so
 * STELLAR_FEE_SPONSOR_SECRET is irrelevant there).
 */

const CONTRACT_ID_RE = /^C[A-Z2-7]{55}$/;
const ACCOUNT_ID_RE = /^G[A-Z2-7]{55}$/;

function isValidUrl(value: string): boolean {
  try {
    new URL(value);
    return true;
  } catch {
    return false;
  }
}

/** Runs the checks and returns human-readable warning lines (empty if clean). */
export function collectEnvWarnings(env: NodeJS.ProcessEnv = process.env): string[] {
  const warnings: string[] = [];
  const isStaticExport = env.NEXT_EXPORT === "true";

  const factoryId = env.NEXT_PUBLIC_FACTORY_CONTRACT_ID?.trim();
  if (!factoryId) {
    warnings.push(
      "NEXT_PUBLIC_FACTORY_CONTRACT_ID is not set — platform stats and pool listings will be empty until it's configured.",
    );
  } else if (!CONTRACT_ID_RE.test(factoryId)) {
    warnings.push(
      `NEXT_PUBLIC_FACTORY_CONTRACT_ID ("${factoryId}") does not look like a valid Soroban contract address (expected "C" followed by 55 base32 characters).`,
    );
  }

  const poolId = env.NEXT_PUBLIC_POOL_CONTRACT_ID?.trim();
  if (poolId && !CONTRACT_ID_RE.test(poolId)) {
    warnings.push(
      `NEXT_PUBLIC_POOL_CONTRACT_ID ("${poolId}") does not look like a valid Soroban contract address.`,
    );
  }

  const simulationAccount = env.NEXT_PUBLIC_SIMULATION_ACCOUNT?.trim();
  if (!simulationAccount) {
    warnings.push(
      "NEXT_PUBLIC_SIMULATION_ACCOUNT is not set — read-only Soroban simulation calls (pool data, user positions, credits) will fail at runtime.",
    );
  } else if (!ACCOUNT_ID_RE.test(simulationAccount)) {
    warnings.push(
      `NEXT_PUBLIC_SIMULATION_ACCOUNT ("${simulationAccount}") does not look like a valid Stellar account address (expected "G" followed by 55 base32 characters).`,
    );
  }

  for (const [key, value] of [
    ["NEXT_PUBLIC_SOROBAN_RPC_URL", env.NEXT_PUBLIC_SOROBAN_RPC_URL],
    ["NEXT_PUBLIC_HORIZON_URL", env.NEXT_PUBLIC_HORIZON_URL],
    ["NEXT_PUBLIC_BACKEND_API_URL", env.NEXT_PUBLIC_BACKEND_API_URL],
  ] as const) {
    if (value && !isValidUrl(value)) {
      warnings.push(`${key} ("${value}") is not a valid URL.`);
    }
  }

  if (!isStaticExport && !env.STELLAR_FEE_SPONSOR_SECRET) {
    warnings.push(
      "STELLAR_FEE_SPONSOR_SECRET is not set — /api/sign-fee-bump will return 500 for every request until it's configured.",
    );
  }

  return warnings;
}

/** Logs any warnings to the console, prefixed for easy grepping in build logs. */
export function validateEnv(env: NodeJS.ProcessEnv = process.env): void {
  const warnings = collectEnvWarnings(env);
  if (warnings.length === 0) return;

  console.warn("\n[SmartDrop] Environment configuration warnings:");
  for (const warning of warnings) {
    console.warn(`  - ${warning}`);
  }
  console.warn("");
}

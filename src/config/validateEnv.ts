import { StrKey } from '@stellar/stellar-sdk';

/**
 * Fails fast with a clear message instead of letting a missing or malformed
 * env var fall through to demo-mode data or a runtime 500 (issue #199).
 * Called from next.config.ts, which Next.js loads before both `next build`
 * and `next dev`/`next start`.
 *
 * `strict: false` downgrades a failure to a console warning instead of
 * throwing. next.config.ts uses this for Netlify's `deploy-preview` /
 * `branch-deploy` contexts (Netlify sets `CONTEXT`), which don't necessarily
 * have production Soroban config — those builds fell into silent demo mode
 * before this change too, so warn-and-continue there is not a regression,
 * just a louder version of the previous behavior. Local dev/build and
 * Netlify's `production` context stay strict.
 */
export function validateEnv(options: { isStaticExport: boolean; strict?: boolean }): void {
  const { strict = true } = options;
  const problems: string[] = [];

  const factoryContractId = process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID;
  if (!factoryContractId) {
    problems.push('NEXT_PUBLIC_FACTORY_CONTRACT_ID is not set.');
  } else if (!StrKey.isValidContract(factoryContractId)) {
    problems.push(
      `NEXT_PUBLIC_FACTORY_CONTRACT_ID ("${factoryContractId}") is not a valid Soroban contract id.`,
    );
  }

  const sorobanRpcUrl = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL;
  if (sorobanRpcUrl) {
    try {
      new URL(sorobanRpcUrl);
    } catch {
      problems.push(`NEXT_PUBLIC_SOROBAN_RPC_URL ("${sorobanRpcUrl}") is not a valid URL.`);
    }
  }

  // STELLAR_FEE_SPONSOR_SECRET only backs the /api/sign-fee-bump route, which
  // doesn't exist in static-export builds (see next.config.ts).
  if (!options.isStaticExport) {
    const sponsorSecret = process.env.STELLAR_FEE_SPONSOR_SECRET;
    if (!sponsorSecret) {
      problems.push(
        'STELLAR_FEE_SPONSOR_SECRET is not set (required in server mode for /api/sign-fee-bump).',
      );
    } else if (!StrKey.isValidEd25519SecretSeed(sponsorSecret)) {
      problems.push('STELLAR_FEE_SPONSOR_SECRET is set but is not a valid Stellar secret key.');
    }
  }

  if (problems.length > 0) {
    const message =
      `Invalid environment configuration:\n  - ${problems.join('\n  - ')}\n` +
      'Set the required variables in .env.local before building or starting the app.';
    if (strict) {
      throw new Error(message);
    }
    console.warn(`\n⚠️  ${message}\n`);
  }
}

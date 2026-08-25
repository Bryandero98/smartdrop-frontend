/**
 * Server-side validation for /api/sign-fee-bump (issue #124).
 *
 * The route sponsors real XLM spend, so before it fee-bumps and signs an
 * inner transaction it must independently confirm — not just trust the
 * client's advisory `isFeeSponsored` check — that the inner transaction is
 * actually a SmartDrop lock/unlock call against a known pool, and that it
 * already carries a valid signature from its own source account.
 */
import { Address, Keypair, StrKey, Transaction } from '@stellar/stellar-sdk';

export const SPONSORABLE_FUNCTIONS = new Set(['lock_assets', 'unlock_assets']);

/**
 * Throws if `innerTx` is not exactly one invokeHostFunction call to
 * `lock_assets`/`unlock_assets` on one of `knownPoolContractIds`, or if it
 * isn't already validly signed by its own declared source account.
 */
export function assertSponsorableInnerTransaction(
  innerTx: Transaction,
  knownPoolContractIds: ReadonlySet<string>,
): void {
  const operations = innerTx.operations;
  if (operations.length !== 1) {
    throw new Error(
      `Inner transaction must contain exactly one operation, got ${operations.length}.`,
    );
  }

  const op = operations[0];
  if (op.type !== 'invokeHostFunction') {
    throw new Error(
      `Inner transaction operation type "${op.type}" is not sponsorable; only invokeHostFunction is allowed.`,
    );
  }

  const hostFn = op.func;
  if (hostFn.switch().name !== 'hostFunctionTypeInvokeContract') {
    throw new Error('Inner transaction must invoke a contract function.');
  }

  const invocation = hostFn.invokeContract();
  const contractId = Address.fromScAddress(invocation.contractAddress()).toString();
  const rawFunctionName = invocation.functionName();
  const functionName =
    typeof rawFunctionName === 'string' ? rawFunctionName : rawFunctionName.toString('utf8');

  if (!knownPoolContractIds.has(contractId)) {
    throw new Error(`Inner transaction targets an unrecognized pool contract: ${contractId}.`);
  }

  if (!SPONSORABLE_FUNCTIONS.has(functionName)) {
    throw new Error(
      `Inner transaction calls "${functionName}", which is not a sponsorable function.`,
    );
  }

  if (innerTx.signatures.length === 0) {
    throw new Error('Inner transaction is not signed.');
  }

  if (!StrKey.isValidEd25519PublicKey(innerTx.source)) {
    throw new Error('Inner transaction source account is not a supported address type.');
  }

  const sourceKeypair = Keypair.fromPublicKey(innerTx.source);
  const hash = innerTx.hash();
  const hasValidSourceSignature = innerTx.signatures.some((sig) => {
    try {
      return sourceKeypair.verify(hash, sig.signature());
    } catch {
      return false;
    }
  });

  if (!hasValidSourceSignature) {
    throw new Error(
      'Inner transaction does not carry a valid signature from its own source account.',
    );
  }
}

/**
 * Minimal in-memory sliding-window rate limiter, keyed by caller (source
 * account, IP, etc). Per-process only — fine for a single-instance deploy;
 * a multi-instance deploy should replace this with a shared store (e.g.
 * Redis/edge KV) keyed the same way.
 */
export class RateLimiter {
  private hits = new Map<string, number[]>();

  constructor(
    private readonly maxRequests: number,
    private readonly windowMs: number,
  ) {}

  /** Returns true and records the hit if `key` is within its limit, false if throttled. */
  tryConsume(key: string, now: number = Date.now()): boolean {
    const windowStart = now - this.windowMs;
    const recent = (this.hits.get(key) ?? []).filter((t) => t > windowStart);

    if (recent.length >= this.maxRequests) {
      this.hits.set(key, recent);
      return false;
    }

    recent.push(now);
    this.hits.set(key, recent);
    return true;
  }
}

export const feeBumpRateLimiter = new RateLimiter(5, 60_000);

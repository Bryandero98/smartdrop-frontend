/**
 * Pure XDR→native parser helpers for SmartDrop Soroban contracts.
 *
 * This file has NO @stellar/stellar-sdk import so it can be unit-tested
 * under Jest (CommonJS) without hitting @noble/hashes ESM-only builds.
 * soroban.ts calls scValToNative and then delegates to the functions here.
 */

export interface AssetInfo {
  code: string;
  issuer?: string;
  isNative?: boolean;
}

export interface PoolInfo {
  id: string;
  contractAddress: string;
  asset: AssetInfo;
  dailyRate: string;
  minLockPeriod: number;
  totalLocked: string;
  totalUsers: number;
  isActive: boolean;
  createdAt: number;
}

export interface UserPosition {
  user: string;
  poolId: string;
  amount: string;
  lockedAt: number;
  credits: string;
  isLocked: boolean;
  unlockableAt: number;
  boostAllocation?: number;
}

/**
 * Decode a byte-array value returned by scValToNative for scvString entries.
 * Works in both Node.js (Buffer) and browser (Uint8Array) environments.
 */
export function decodeScString(v: unknown): string {
  if (v instanceof Uint8Array) return new TextDecoder().decode(v);
  return String(v ?? '');
}

/**
 * Convert a Soroban i128/u128/u64 stroops value to a 7-decimal display string.
 * Stroops are the smallest Stellar unit: 1 XLM = 10,000,000 stroops.
 */
export function bigintToDisplayAmount(raw: unknown): string {
  if (typeof raw === 'bigint') {
    const stroops = raw < 0n ? 0n : raw;
    const whole = stroops / 10_000_000n;
    const frac = stroops % 10_000_000n;
    return `${whole}.${String(frac).padStart(7, '0')}`;
  }
  return String(raw ?? '0');
}

/**
 * Parse a single pool entry (a Record produced by scValToNative on an ScMap)
 * into a typed PoolInfo.
 *
 * Expected canonical contract field names (snake_case):
 *   id, contract_address, asset_code, asset_issuer, is_native,
 *   daily_rate (i128 stroops), min_lock_period (u64 seconds),
 *   total_locked (i128 stroops), total_users (u32), is_active (bool), created_at (u64)
 *
 * Nested asset object { code, issuer, is_native } is also accepted.
 * Throws on missing required structure so the caller can skip with a warning.
 *
 * ## Pool `id` stability guarantee
 *
 * The derived `id` is only guaranteed stable when it comes from one of the
 * following fields (checked in priority order):
 *
 *   1. `id` / `pool_id`  — explicit on-chain identifier; most stable.
 *   2. `contract_address` / `address` / `pool_address` — stable on-chain
 *      address, independent of the factory's return-order.
 *   3. Array index fallback (`String(fallbackIndex)`) — **NOT stable**.
 *      This path only fires when the contract returns a pool entry with none
 *      of the above fields populated.  It is treated as a signal of an
 *      unexpected/malformed contract response and a `console.warn` is emitted.
 *      A `/farm/[poolId]` URL built from this id may silently resolve to a
 *      different pool if the factory ever returns pools in a different order.
 */
export function parsePoolEntry(
  entry: Record<string, unknown>,
  fallbackIndex: number,
): PoolInfo {
  // Asset fields may arrive nested ({ asset: { code, issuer, is_native } }) or flat.
  const assetObj =
    typeof entry['asset'] === 'object' && entry['asset'] !== null
      ? (entry['asset'] as Record<string, unknown>)
      : undefined;

  const code =
    decodeScString(assetObj?.['code'] ?? entry['asset_code']) || 'XLM';
  const rawIssuer = assetObj?.['issuer'] ?? entry['asset_issuer'];
  const issuer =
    rawIssuer != null &&
    rawIssuer !== '' &&
    !(rawIssuer instanceof Uint8Array && rawIssuer.length === 0)
      ? decodeScString(rawIssuer)
      : undefined;
  const isNative = Boolean(assetObj?.['is_native'] ?? entry['is_native'] ?? !issuer);

  const contractAddress = decodeScString(
    entry['contract_address'] ?? entry['address'] ?? entry['pool_address'] ?? '',
  );

  // Derive a stable pool id in priority order:
  //   1. explicit id / pool_id  (strongest — on-chain identity)
  //   2. contract_address       (stable on-chain address, order-independent)
  //   3. array index fallback   (unstable — emits a distinct warning)
  const explicitId = decodeScString(entry['id'] ?? entry['pool_id'] ?? '');
  let id: string;
  if (explicitId) {
    id = explicitId;
  } else if (contractAddress) {
    id = contractAddress;
  } else {
    console.warn(
      `[SmartDrop] parsePoolEntry: pool at index ${fallbackIndex} has no ` +
        `id/pool_id/contract_address — falling back to its array position, ` +
        `which is NOT stable across factory pool-ordering changes. ` +
        `Its /farm/[poolId] URL may silently point to a different pool later. ` +
        `This is likely a malformed contract response and should be investigated.`,
    );
    id = String(fallbackIndex);
  }

  return {
    id,
    contractAddress,
    asset: { code, issuer, isNative },
    dailyRate: bigintToDisplayAmount(entry['daily_rate'] ?? entry['rate'] ?? 0n),
    minLockPeriod: Number(entry['min_lock_period'] ?? entry['lock_period'] ?? 0),
    totalLocked: bigintToDisplayAmount(entry['total_locked'] ?? entry['tvl'] ?? 0n),
    totalUsers: Number(entry['total_users'] ?? entry['users'] ?? 0),
    isActive: Boolean(entry['is_active'] ?? true),
    createdAt: Number(entry['created_at'] ?? entry['timestamp'] ?? 0),
  };
}

/**
 * Parse an already-native array (output of scValToNative on a Vec<Map>) into PoolInfo[].
 * Malformed entries are skipped with a console warning.
 *
 * Exported separately from parsePoolsFromXdrResult so tests can call it
 * without importing @stellar/stellar-sdk (which ships pure-ESM deps
 * incompatible with Jest's CommonJS transform).
 */
export function parsePoolsFromNative(native: unknown[]): PoolInfo[] {
  const pools: PoolInfo[] = [];
  for (let i = 0; i < native.length; i++) {
    try {
      const entry = native[i];
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
        throw new TypeError(
          `entry is not an object (got ${entry === null ? 'null' : typeof entry})`,
        );
      }
      pools.push(parsePoolEntry(entry as Record<string, unknown>, i));
    } catch (err) {
      console.warn(
        `[SmartDrop] parsePoolsFromXdr: skipping malformed pool at index ${i}:`,
        err,
      );
    }
  }
  return pools;
}

/**
 * Parse an already-native UserPosition map into a typed UserPosition, or null.
 */
export function parseUserPositionFromNative(
  native: Record<string, unknown>,
  poolId: string,
  userAddress: string,
): UserPosition | null {
  if (!native || typeof native !== 'object') return null;

  const lockedAt = Number(native['locked_at'] ?? native['timestamp'] ?? 0);

  // Prefer explicit unlockable_at/unlock_at; fall back to lockedAt + min_lock_period.
  let unlockableAt: number;
  if (native['unlockable_at'] != null) {
    unlockableAt = Number(native['unlockable_at']);
  } else if (native['unlock_at'] != null) {
    unlockableAt = Number(native['unlock_at']);
  } else {
    const minLock = Number(native['min_lock_period'] ?? native['lock_period'] ?? 0);
    unlockableAt = minLock > 0 ? lockedAt + minLock : 0;
  }

  return {
    user: userAddress,
    poolId,
    amount: bigintToDisplayAmount(native['amount'] ?? native['locked_amount'] ?? 0n),
    lockedAt,
    credits: bigintToDisplayAmount(native['credits'] ?? native['accrued_credits'] ?? 0n),
    isLocked: Boolean(native['is_locked'] ?? false),
    unlockableAt,
    boostAllocation:
      native['boost_allocation'] != null
        ? Number(native['boost_allocation'])
        : native['boost'] != null
          ? Number(native['boost'])
          : undefined,
  };
}

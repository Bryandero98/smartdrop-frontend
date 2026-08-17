/**
 * Tests for soroban-parsers.ts
 *
 * This file has no @stellar/stellar-sdk import so it runs under Jest/Vitest
 * CommonJS without hitting @noble/hashes ESM-only builds.
 *
 * Covers issue #145: Pool id stability across factory pool-ordering changes.
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  decodeScString,
  bigintToDisplayAmount,
  parsePoolEntry,
  parsePoolsFromNative,
} from './soroban-parsers';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const CONTRACT_A = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const CONTRACT_B = 'CBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBSC4';

function makePool(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    contract_address: CONTRACT_A,
    asset_code: 'XLM',
    daily_rate: 100_000n,
    min_lock_period: 604800,
    total_locked: 0n,
    total_users: 0,
    is_active: true,
    created_at: 0,
    ...overrides,
  };
}

// ---------------------------------------------------------------------------
// decodeScString
// ---------------------------------------------------------------------------

describe('decodeScString', () => {
  it('decodes a Uint8Array to a string', () => {
    const bytes = new TextEncoder().encode('hello');
    expect(decodeScString(bytes)).toBe('hello');
  });

  it('returns a string value unchanged', () => {
    expect(decodeScString('world')).toBe('world');
  });

  it('returns empty string for null/undefined', () => {
    expect(decodeScString(null)).toBe('');
    expect(decodeScString(undefined)).toBe('');
  });
});

// ---------------------------------------------------------------------------
// bigintToDisplayAmount
// ---------------------------------------------------------------------------

describe('bigintToDisplayAmount', () => {
  it('converts stroops to 7-decimal display string', () => {
    expect(bigintToDisplayAmount(10_000_000n)).toBe('1.0000000');
    expect(bigintToDisplayAmount(12_500_000n)).toBe('1.2500000');
    expect(bigintToDisplayAmount(0n)).toBe('0.0000000');
  });

  it('clamps negative values to 0', () => {
    expect(bigintToDisplayAmount(-5n)).toBe('0.0000000');
  });

  it('returns string for non-bigint values', () => {
    expect(bigintToDisplayAmount('raw')).toBe('raw');
  });
});

// ---------------------------------------------------------------------------
// parsePoolEntry — id derivation (issue #145)
// ---------------------------------------------------------------------------

describe('parsePoolEntry – id derivation', () => {
  it('uses explicit id field when present', () => {
    const pool = makePool({ id: 'my-explicit-id' });
    const result = parsePoolEntry(pool, 0);
    expect(result.id).toBe('my-explicit-id');
  });

  it('uses pool_id when id is absent', () => {
    const pool = makePool({ pool_id: 'pid-123' });
    const result = parsePoolEntry(pool, 0);
    expect(result.id).toBe('pid-123');
  });

  it('falls back to contract_address when neither id nor pool_id is present', () => {
    const pool = makePool(); // has contract_address = CONTRACT_A, no id/pool_id
    const result = parsePoolEntry(pool, 0);
    expect(result.id).toBe(CONTRACT_A);
  });

  it('falls back to address field when contract_address absent', () => {
    const pool = makePool({ contract_address: undefined, address: CONTRACT_B });
    const result = parsePoolEntry(pool, 0);
    expect(result.id).toBe(CONTRACT_B);
  });

  it('falls back to pool_address field when contract_address and address are absent', () => {
    const pool = makePool({ contract_address: undefined, pool_address: CONTRACT_B });
    const result = parsePoolEntry(pool, 0);
    expect(result.id).toBe(CONTRACT_B);
  });

  // -------------------------------------------------------------------------
  // Acceptance criteria #1 (non-regression):
  // A pool with a valid contract_address but no id/pool_id uses contract_address as id.
  // -------------------------------------------------------------------------
  it('[AC1] pool with contract_address but no id/pool_id uses contract_address', () => {
    const pool = makePool({ contract_address: CONTRACT_A });
    const { id } = parsePoolEntry(pool, 99); // fallbackIndex should not be used
    expect(id).toBe(CONTRACT_A);
  });

  // -------------------------------------------------------------------------
  // Acceptance criteria #2:
  // Pool with none of id/pool_id/contract_address triggers a distinct warning.
  // -------------------------------------------------------------------------
  it('[AC2] emits distinct warning when index-fallback is used', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const pool = makePool({
      contract_address: undefined,
      address: undefined,
      pool_address: undefined,
    });

    const result = parsePoolEntry(pool, 3);

    expect(result.id).toBe('3');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const msg: string = warnSpy.mock.calls[0][0];
    // Warning must mention the index and "NOT stable"
    expect(msg).toMatch(/\[SmartDrop\]/);
    expect(msg).toMatch(/NOT stable/);
    expect(msg).toMatch(/3/);

    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// parsePoolsFromNative — ordering stability (issue #145)
// ---------------------------------------------------------------------------

describe('parsePoolsFromNative – pool-ordering stability', () => {
  // Acceptance criteria #3:
  // Two getFactoryPools() responses containing the same pools in different
  // orders must resolve pools identified via contract_address to the same id.
  it('[AC3] pool id is stable regardless of array position (contract_address path)', () => {
    const poolA = makePool({ contract_address: CONTRACT_A });
    const poolB = makePool({ contract_address: CONTRACT_B, asset_code: 'USDC' });

    const orderOne = parsePoolsFromNative([poolA, poolB]);
    const orderTwo = parsePoolsFromNative([poolB, poolA]);

    // Regardless of position, each pool resolves to its contract address.
    expect(orderOne.find((p) => p.id === CONTRACT_A)).toBeDefined();
    expect(orderOne.find((p) => p.id === CONTRACT_B)).toBeDefined();
    expect(orderTwo.find((p) => p.id === CONTRACT_A)).toBeDefined();
    expect(orderTwo.find((p) => p.id === CONTRACT_B)).toBeDefined();

    // The id of the first pool in one order must equal the id in the other order.
    const aFromOrderOne = orderOne.find((p) => p.id === CONTRACT_A)!;
    const aFromOrderTwo = orderTwo.find((p) => p.id === CONTRACT_A)!;
    expect(aFromOrderOne.id).toBe(aFromOrderTwo.id);
  });

  it('[AC3] pool id is stable regardless of array position (explicit id path)', () => {
    const poolA = makePool({ id: 'pool-alpha', contract_address: CONTRACT_A });
    const poolB = makePool({ id: 'pool-beta', contract_address: CONTRACT_B });

    const orderOne = parsePoolsFromNative([poolA, poolB]);
    const orderTwo = parsePoolsFromNative([poolB, poolA]);

    expect(orderOne[0].id).toBe('pool-alpha');
    expect(orderOne[1].id).toBe('pool-beta');
    expect(orderTwo[0].id).toBe('pool-beta');
    expect(orderTwo[1].id).toBe('pool-alpha');
  });

  it('[AC3] pool missing all address fields triggers warning with its fallback index', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const goodPool = makePool({ contract_address: CONTRACT_A });
    const badPool = makePool({
      contract_address: undefined,
      address: undefined,
      pool_address: undefined,
    });

    // badPool is at index 1 in this call
    const result = parsePoolsFromNative([goodPool, badPool]);

    expect(result).toHaveLength(2);
    expect(result[0].id).toBe(CONTRACT_A); // good pool — no warning
    expect(result[1].id).toBe('1');        // bad pool — index fallback

    // The "skipping malformed" warning must NOT have fired for this entry
    // (it's not being skipped), but the new "NOT stable" warning must have.
    const warnMessages: string[] = warnSpy.mock.calls.map((c) => String(c[0]));
    const stableWarning = warnMessages.find((m) => m.includes('NOT stable'));
    expect(stableWarning).toBeDefined();
    expect(stableWarning).toMatch(/1/); // index 1

    warnSpy.mockRestore();
  });

  it('skips and warns on genuinely malformed (non-object) entries', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parsePoolsFromNative([null, makePool({ contract_address: CONTRACT_A })]);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe(CONTRACT_A);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(String(warnSpy.mock.calls[0][0])).toMatch(/skipping malformed/);
    warnSpy.mockRestore();
  });
});

// ---------------------------------------------------------------------------
// parsePoolEntry — contractAddress field is always populated
// ---------------------------------------------------------------------------

describe('parsePoolEntry – contractAddress field', () => {
  it('contractAddress is set independently from id', () => {
    const pool = makePool({ id: 'my-id', contract_address: CONTRACT_A });
    const result = parsePoolEntry(pool, 0);
    expect(result.id).toBe('my-id');
    expect(result.contractAddress).toBe(CONTRACT_A);
  });

  it('contractAddress is empty string when no address fields present', () => {
    const pool = makePool({
      contract_address: undefined,
      address: undefined,
      pool_address: undefined,
    });
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = parsePoolEntry(pool, 0);
    expect(result.contractAddress).toBe('');
    vi.restoreAllMocks();
  });
});

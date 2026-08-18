import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { getContractErrorMessage } from './soroban';

describe('getContractErrorMessage', () => {
  // Enumerates every entry in CONTRACT_ERROR_MESSAGES (soroban.ts), sourced
  // from the deployed farming-pool contract's PoolError enum for codes 2-9
  // (#146). Code '1' predates this table — see the comment above
  // CONTRACT_ERROR_MESSAGES in soroban.ts for why it's kept as-is.
  it.each([
    ['1', 'Assets are still locked'],
    ['2', 'The pool has not been initialized yet'],
    ['3', 'Invalid credit rate configuration'],
    ['4', 'Invalid boost multiplier configuration'],
    ['5', 'This wallet is not on the whitelist for this pool'],
    ['6', 'Amount is below the minimum stake for this pool'],
    ['7', 'This action requires the pool to be paused first'],
    ['8', 'No active stake or locked position was found for this wallet'],
    ['9', 'This pool is currently paused'],
  ])('maps code %s to %j', (code, expected) => {
    expect(getContractErrorMessage(code)).toBe(expected);
  });

  it('accepts a decimal-string error code embedded in a longer message', () => {
    expect(getContractErrorMessage('Host function failed with contract code: 6')).toBe(
      'Amount is below the minimum stake for this pool',
    );
  });

  it('accepts a hex-encoded error code', () => {
    expect(getContractErrorMessage('0x6')).toBe(
      'Amount is below the minimum stake for this pool',
    );
  });

  describe('unmapped codes', () => {
    let warnSpy: ReturnType<typeof vi.spyOn>;

    beforeEach(() => {
      warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    });

    afterEach(() => {
      warnSpy.mockRestore();
    });

    it('returns undefined for an intentionally-unmapped code', () => {
      expect(getContractErrorMessage('99')).toBeUndefined();
    });

    it('logs the unmapped code distinctly so gaps are discoverable', () => {
      getContractErrorMessage('99');

      expect(warnSpy).toHaveBeenCalledWith('[SmartDrop] Unmapped contract error code:', '99');
    });

    it('does not warn for a mapped code', () => {
      getContractErrorMessage('1');

      expect(warnSpy).not.toHaveBeenCalled();
    });
  });

  it('returns undefined without warning when no error code was extracted', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    expect(getContractErrorMessage(undefined)).toBeUndefined();
    expect(warnSpy).not.toHaveBeenCalled();

    warnSpy.mockRestore();
  });
});

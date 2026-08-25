import { describe, it, expect, vi } from 'vitest';
import { xdr, nativeToScVal, StrKey, Address } from '@stellar/stellar-sdk';
import { getUserTransactionHistory, getAllEvents } from './soroban';
// Generate valid-format Stellar G-addresses from fixed 32-byte seeds.
const USER_KEY = StrKey.encodeEd25519PublicKey(new Uint8Array(32));
const OTHER_KEY = StrKey.encodeEd25519PublicKey(new Uint8Array(32).fill(1));
const POOL_ID = 'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';
const TX_HASH_1 = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const TX_HASH_2 = 'fedcba0987654321fedcba0987654321fedcba0987654321fedcba0987654321';
const TX_HASH_3 = '1111111111111111111111111111111111111111111111111111111111111111';

function makeEvent(
  action: 'lock_assets' | 'unlock_assets',
  userAddr: string,
  valueArr: unknown[],
  txHash: string,
  ledgerClosedAt: string,
  contractId = POOL_ID,
  inSuccessfulContractCall = true,
) {
  return {
    inSuccessfulContractCall,
    contractId,
    txHash,
    ledgerClosedAt,
    // topic[0]: action symbol; topic[1]: user address as scvAddress
    topic: [
      xdr.ScVal.scvSymbol(action),
      new Address(userAddr).toScVal(),
    ],
    // value: a vec of [amount, symbol] or [amount, symbol, credits]
    value: nativeToScVal(valueArr),
  };
}

function makeMockServer(events: unknown[], latestLedger = 1000000) {
  return {
    getLatestLedger: vi.fn().mockResolvedValue({ sequence: latestLedger }),
    getEvents: vi.fn().mockResolvedValue({
      events,
      latestLedger,
      oldestLedger: latestLedger - 120960,
    }),
  };
}

describe('getUserTransactionHistory', () => {
  it('returns empty result when publicKey is empty', async () => {
    const server = makeMockServer([]);
    const result = await getUserTransactionHistory('', [POOL_ID], server);
    expect(result).toEqual({ entries: [], truncated: false });
    expect(server.getLatestLedger).not.toHaveBeenCalled();
  });

  it('returns empty result when poolContractIds is empty', async () => {
    const server = makeMockServer([]);
    const result = await getUserTransactionHistory(USER_KEY, [], server);
    expect(result).toEqual({ entries: [], truncated: false });
    expect(server.getLatestLedger).not.toHaveBeenCalled();
  });

  it('parses a lock event correctly', async () => {
    const evt = makeEvent('lock_assets', USER_KEY, [100000000, 'XLM'], TX_HASH_1, '2026-06-19T10:00:00Z');
    const server = makeMockServer([evt]);
    const { entries } = await getUserTransactionHistory(USER_KEY, [POOL_ID], server);

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.action).toBe('lock');
    expect(entry.amount).toBe('100000000');
    expect(entry.symbol).toBe('XLM');
    expect(entry.poolId).toBe(POOL_ID);
    expect(entry.txHash).toBe(TX_HASH_1);
    expect(entry.date).toBe('2026-06-19T10:00:00Z');
    expect(entry.creditsEarned).toBeUndefined();
  });

  it('parses an unlock event with creditsEarned correctly', async () => {
    const evt = makeEvent('unlock_assets', USER_KEY, [50000000, 'XLM', 250], TX_HASH_2, '2026-06-18T08:00:00Z');
    const server = makeMockServer([evt]);
    const { entries } = await getUserTransactionHistory(USER_KEY, [POOL_ID], server);

    expect(entries).toHaveLength(1);
    const entry = entries[0];
    expect(entry.action).toBe('unlock');
    expect(entry.amount).toBe('50000000');
    expect(entry.symbol).toBe('XLM');
    expect(entry.creditsEarned).toBe('250');
    expect(entry.txHash).toBe(TX_HASH_2);
  });

  it('filters out events from other users', async () => {
    const userEvt = makeEvent('lock_assets', USER_KEY, [100000000, 'XLM'], TX_HASH_1, '2026-06-19T10:00:00Z');
    const otherEvt = makeEvent('lock_assets', OTHER_KEY, [999999999, 'XLM'], TX_HASH_3, '2026-06-19T09:00:00Z');
    const server = makeMockServer([userEvt, otherEvt]);
    const { entries } = await getUserTransactionHistory(USER_KEY, [POOL_ID], server);

    expect(entries).toHaveLength(1);
    expect(entries[0].txHash).toBe(TX_HASH_1);
  });

  it('filters out events not in successful contract calls', async () => {
    const evt = makeEvent('lock_assets', USER_KEY, [100000000, 'XLM'], TX_HASH_1, '2026-06-19T10:00:00Z', POOL_ID, false);
    const server = makeMockServer([evt]);
    const { entries } = await getUserTransactionHistory(USER_KEY, [POOL_ID], server);
    expect(entries).toHaveLength(0);
  });

  it('returns empty result when no events match', async () => {
    const server = makeMockServer([]);
    const { entries } = await getUserTransactionHistory(USER_KEY, [POOL_ID], server);
    expect(entries).toEqual([]);
  });

  it('sorts entries newest first', async () => {
    const older = makeEvent('lock_assets', USER_KEY, [100000000, 'XLM'], TX_HASH_1, '2026-06-17T00:00:00Z');
    const newer = makeEvent('unlock_assets', USER_KEY, [50000000, 'XLM', 10], TX_HASH_2, '2026-06-19T00:00:00Z');
    const server = makeMockServer([older, newer]);
    const { entries } = await getUserTransactionHistory(USER_KEY, [POOL_ID], server);

    expect(entries).toHaveLength(2);
    expect(entries[0].txHash).toBe(TX_HASH_2);
    expect(entries[1].txHash).toBe(TX_HASH_1);
  });

  it('returns empty result when the RPC server throws', async () => {
    const server = {
      getLatestLedger: vi.fn().mockRejectedValue(new Error('RPC unavailable')),
      getEvents: vi.fn(),
    };
    const { entries } = await getUserTransactionHistory(USER_KEY, [POOL_ID], server);
    expect(entries).toEqual([]);
  });

  it('passes correct startLedger and filters to getEvents', async () => {
    const server = makeMockServer([]);
    await getUserTransactionHistory(USER_KEY, [POOL_ID], server);

    expect(server.getEvents).toHaveBeenCalledTimes(1);
    const callArg = server.getEvents.mock.calls[0][0];
    expect(callArg.startLedger).toBe(1000000 - 120960);
    expect(callArg.filters[0].type).toBe('contract');
    expect(callArg.filters[0].contractIds).toEqual([POOL_ID]);
    expect(callArg.filters[0].topics).toHaveLength(2);
    expect(callArg.limit).toBe(200);
  });
});

describe('getAllEvents pagination', () => {
  it('returns a single page when events fit within the limit', async () => {
    const events = [{ inSuccessfulContractCall: true, topic: [], value: {}, ledgerClosedAt: '', txHash: 'tx1' }];
    const server = {
      getEvents: vi.fn().mockResolvedValue({ events, latestLedger: 100, oldestLedger: 90 }),
    };
    const result = await getAllEvents(server as never, {
      startLedger: 90,
      endLedger: 100,
      filters: [{ type: 'contract' as const, contractIds: ['pool'], topics: [] }],
      limit: 500,
    });

    expect(result.events).toHaveLength(1);
    expect(result.truncated).toBe(false);
    expect(server.getEvents).toHaveBeenCalledTimes(1);
  });

  it('paginates across multiple pages', async () => {
    const page1 = Array.from({ length: 500 }, (_, i) => ({
      inSuccessfulContractCall: true,
      topic: [],
      value: {},
      ledgerClosedAt: '',
      txHash: `tx${i}`,
    }));
    const page2 = [{ inSuccessfulContractCall: true, topic: [], value: {}, ledgerClosedAt: '', txHash: 'tx500' }];

    const server = {
      getEvents: vi.fn()
        .mockResolvedValueOnce({ events: page1, latestLedger: 50, oldestLedger: 1 })
        .mockResolvedValueOnce({ events: page2, latestLedger: 100, oldestLedger: 51 }),
    };

    const result = await getAllEvents(server as never, {
      startLedger: 1,
      endLedger: 100,
      filters: [{ type: 'contract' as const, contractIds: ['pool'], topics: [] }],
      limit: 500,
    });

    expect(result.events).toHaveLength(501);
    expect(result.truncated).toBe(false);
    expect(server.getEvents).toHaveBeenCalledTimes(2);
  });

  it('marks truncated when loop cap is hit', async () => {
    const events = Array.from({ length: 500 }, (_, i) => ({
      inSuccessfulContractCall: true,
      topic: [],
      value: {},
      ledgerClosedAt: '',
      txHash: `tx${i}`,
    }));
    const server = {
      getEvents: vi.fn().mockResolvedValue({ events, latestLedger: 50, oldestLedger: 1 }),
    };

    const result = await getAllEvents(server as never, {
      startLedger: 1,
      endLedger: 1000,
      filters: [{ type: 'contract' as const, contractIds: ['pool'], topics: [] }],
      limit: 500,
    });

    expect(result.truncated).toBe(true);
    // MAX_EVENT_PAGES is 20
    expect(server.getEvents).toHaveBeenCalledTimes(20);
  });

  it('stops when a page returns fewer events than the limit', async () => {
    const events = Array.from({ length: 100 }, (_, i) => ({
      inSuccessfulContractCall: true,
      topic: [],
      value: {},
      ledgerClosedAt: '',
      txHash: `tx${i}`,
    }));
    const server = {
      getEvents: vi.fn().mockResolvedValue({ events, latestLedger: 100, oldestLedger: 1 }),
    };

    const result = await getAllEvents(server as never, {
      startLedger: 1,
      endLedger: 1000,
      filters: [{ type: 'contract' as const, contractIds: ['pool'], topics: [] }],
      limit: 500,
    });

    expect(result.events).toHaveLength(100);
    expect(result.truncated).toBe(false);
    expect(server.getEvents).toHaveBeenCalledTimes(1);
  });
});

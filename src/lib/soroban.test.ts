import { describe, expect, it, vi } from 'vitest';
import {
  Account,
  Address,
  Keypair,
  StrKey,
  scValToNative,
  type xdr,
} from '@stellar/stellar-sdk';
import { amountToStroops, buildLockAssetsTransaction, formatCredits, SorobanService } from './soroban';

vi.mock('@/config', () => ({
  factoryContractId: '',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
}));

const SELECTED_POOL_CONTRACT_ID =
  'CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4';

type InvokeContractOperation = {
  type: 'invokeHostFunction';
  func: {
    invokeContract: () => {
      contractAddress: () => xdr.ScAddress;
      functionName: () => string;
      args: () => xdr.ScVal[];
    };
  };
};

describe('buildLockAssetsTransaction', () => {
  it('builds a lock_assets contract call with a 7-decimal i128 amount', async () => {
    const publicKey = StrKey.encodeEd25519PublicKey(new Uint8Array(32).fill(7));
    const keypair = Keypair.fromPublicKey(publicKey);
    expect(keypair.publicKey()).toBe(publicKey);
    const account = new Account(publicKey, '42');
    const rpcServer = {
      getAccount: vi.fn().mockResolvedValue(account),
      simulateTransaction: vi.fn(),
    };

    const transaction = await buildLockAssetsTransaction(
      {
        poolContractId: SELECTED_POOL_CONTRACT_ID,
        publicKey,
        amount: '1.25',
      },
      rpcServer,
    );

    const operation = transaction.operations[0] as unknown as InvokeContractOperation;
    const invocation = operation.func.invokeContract();
    const args = invocation.args();

    expect(rpcServer.getAccount).toHaveBeenCalledWith(publicKey);
    expect(operation.type).toBe('invokeHostFunction');
    expect(Address.fromScAddress(invocation.contractAddress()).toString()).toBe(
      SELECTED_POOL_CONTRACT_ID,
    );
    expect(invocation.functionName().toString()).toBe('lock_assets');
    expect(scValToNative(args[0])).toBe(publicKey);
    expect(scValToNative(args[1])).toBe(12500000n);
    expect(amountToStroops('1.25')).toBe(12500000n);
  });
});

describe('formatCredits', () => {
  it.each([
    ['0', '0'],
    ['0.0000001', '0.0000001'],
    ['0.0000123', '0.0000123'],
    ['0.4200000', '0.42'],
    ['1.2345678', '1.2346'],
    ['42.1234567', '42.1235'],
    ['123.456789', '123.46'],
    ['999.949999', '999.95'],
    ['999.95', '1.0K'],
    ['1000', '1.0K'],
    ['1250', '1.3K'],
    ['999949', '999.9K'],
    ['999950', '1.0M'],
    ['1000000', '1.0M'],
    ['2500000', '2.5M'],
  ])('formats %s as %s', (credits, expected) => {
    expect(formatCredits(credits)).toBe(expected);
  });

  it('never rounds a non-zero balance down to zero', () => {
    expect(formatCredits('0.00000001')).toBe('0.00000001');
  });

  it('preserves loading placeholders and handles malformed values', () => {
    expect(formatCredits('-')).toBe('-');
    expect(formatCredits('—')).toBe('—');
    expect(formatCredits('not-a-number')).toBe('0');
  });
});

describe('SorobanService transaction polling', () => {
  it('polls NOT_FOUND responses until the transaction succeeds', async () => {
    vi.useFakeTimers();

    try {
      const getTransaction = vi
        .fn()
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ status: 'NOT_FOUND' })
        .mockResolvedValueOnce({ status: 'SUCCESS', resultXdr: 'success-xdr' });

      const service = new SorobanService() as unknown as {
        rpcServer: { getTransaction: typeof getTransaction };
        pollTransactionStatus: (
          hash: string,
          timeoutMs?: number,
        ) => Promise<{ status: 'SUCCESS' | 'FAILED' | 'TIMEOUT'; resultXdr?: string }>;
      };
      service.rpcServer = { getTransaction };

      const resultPromise = service.pollTransactionStatus('tx-hash');

      await Promise.resolve();
      expect(getTransaction).toHaveBeenCalledTimes(1);

      await vi.advanceTimersByTimeAsync(1000);
      expect(getTransaction).toHaveBeenCalledTimes(2);

      await vi.advanceTimersByTimeAsync(2000);
      const result = await resultPromise;

      expect(result.status).toBe('SUCCESS');
      expect(result.resultXdr).toBe('success-xdr');
      expect(getTransaction).toHaveBeenCalledTimes(3);
    } finally {
      vi.useRealTimers();
    }
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  Account,
  Asset,
  Operation,
  TransactionBuilder,
  Networks,
  StrKey,
} from '@stellar/stellar-sdk';
import { buildFeeBumpTransaction } from './soroban';

vi.mock('@/config', () => ({
  factoryContractId: '',
  horizonUrl: 'https://horizon-testnet.stellar.org',
  networkPassphrase: 'Test SDF Network ; September 2015',
  sorobanRpcUrl: 'https://soroban-testnet.stellar.org',
  simulationAccount: 'GBQ3WPTHKJ5XKWLOKUZJLZL2GVXR6RWQCXUVDQZWM7Q2YNLDRVGM5ZWJ',
  stellarNetwork: 'TESTNET',
}));

const USER_PUBKEY = StrKey.encodeEd25519PublicKey(new Uint8Array(32).fill(1));
const SPONSOR_PUBKEY = StrKey.encodeEd25519PublicKey(new Uint8Array(32).fill(2));
const DEST_PUBKEY = StrKey.encodeEd25519PublicKey(new Uint8Array(32).fill(3));

describe('buildFeeBumpTransaction', () => {
  it('wraps an inner transaction in a fee-bump transaction with correct fee and sponsor', () => {
    const account = new Account(USER_PUBKEY, '100');

    // Build a mock inner transaction
    const innerTx = new TransactionBuilder(account, {
      fee: '100',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: DEST_PUBKEY,
          asset: Asset.native(),
          amount: '10',
        }),
      )
      .setTimeout(300)
      .build();

    // Call buildFeeBumpTransaction
    const feeBumpTx = buildFeeBumpTransaction(
      innerTx,
      SPONSOR_PUBKEY,
      Networks.TESTNET,
    );

    // Verify fee-bump properties
    expect(feeBumpTx.feeSource).toBe(SPONSOR_PUBKEY);
    // Inner fee is 100, so fee-bump fee must be innerFee + 100 = 200
    expect(feeBumpTx.fee).toBe('200');
    expect(feeBumpTx.innerTransaction.toEnvelope().toXDR('base64')).toBe(
      innerTx.toEnvelope().toXDR('base64'),
    );
  });

  it('handles inner transaction passed as an XDR string', () => {
    const account = new Account(USER_PUBKEY, '100');

    const innerTx = new TransactionBuilder(account, {
      fee: '150',
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(
        Operation.payment({
          destination: DEST_PUBKEY,
          asset: Asset.native(),
          amount: '5',
        }),
      )
      .setTimeout(300)
      .build();

    const innerTxXdr = innerTx.toEnvelope().toXDR('base64');

    // Call buildFeeBumpTransaction with XDR string
    const feeBumpTx = buildFeeBumpTransaction(
      innerTxXdr,
      SPONSOR_PUBKEY,
      Networks.TESTNET,
    );

    expect(feeBumpTx.feeSource).toBe(SPONSOR_PUBKEY);
    // Inner fee is 150, fee-bump fee is baseFee * (innerOps + 1) = 150 * (1 + 1) = 300
    expect(feeBumpTx.fee).toBe('300');
    expect(feeBumpTx.innerTransaction.toEnvelope().toXDR('base64')).toBe(innerTxXdr);
  });
});

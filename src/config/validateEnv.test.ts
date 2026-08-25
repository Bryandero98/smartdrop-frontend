import { afterEach, describe, expect, it } from 'vitest';
import { StrKey } from '@stellar/stellar-sdk';
import { validateEnv } from './validateEnv';

// Built via StrKey.encode*, not Keypair.random()/fromSecret(): the latter
// route through @noble/ed25519 signing, which hits a pre-existing
// Vitest-only Buffer-polyfill bug (see feeBumpGuard.test.ts's note on
// Transaction.hash()) — unrelated to this change.
const VALID_CONTRACT_ID = StrKey.encodeContract(new Uint8Array(32).fill(1));
const VALID_SPONSOR_SECRET = StrKey.encodeEd25519SecretSeed(new Uint8Array(32).fill(2));

const ENV_KEYS = [
  'NEXT_PUBLIC_FACTORY_CONTRACT_ID',
  'NEXT_PUBLIC_SOROBAN_RPC_URL',
  'STELLAR_FEE_SPONSOR_SECRET',
] as const;

function setValidEnv() {
  process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID = VALID_CONTRACT_ID;
  process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
  process.env.STELLAR_FEE_SPONSOR_SECRET = VALID_SPONSOR_SECRET;
}

describe('validateEnv', () => {
  afterEach(() => {
    for (const key of ENV_KEYS) delete process.env[key];
  });

  it('passes with a fully valid server-mode env', () => {
    setValidEnv();
    expect(() => validateEnv({ isStaticExport: false })).not.toThrow();
  });

  it('throws when NEXT_PUBLIC_FACTORY_CONTRACT_ID is missing', () => {
    setValidEnv();
    delete process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID;
    expect(() => validateEnv({ isStaticExport: false })).toThrow(
      /NEXT_PUBLIC_FACTORY_CONTRACT_ID is not set/,
    );
  });

  it('throws when NEXT_PUBLIC_FACTORY_CONTRACT_ID is not a valid contract id', () => {
    setValidEnv();
    process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ID = 'not-a-contract-id';
    expect(() => validateEnv({ isStaticExport: false })).toThrow(
      /not a valid Soroban contract id/,
    );
  });

  it('throws when NEXT_PUBLIC_SOROBAN_RPC_URL is set but not a valid URL', () => {
    setValidEnv();
    process.env.NEXT_PUBLIC_SOROBAN_RPC_URL = 'not a url';
    expect(() => validateEnv({ isStaticExport: false })).toThrow(/not a valid URL/);
  });

  it('does not require STELLAR_FEE_SPONSOR_SECRET for static export', () => {
    setValidEnv();
    delete process.env.STELLAR_FEE_SPONSOR_SECRET;
    expect(() => validateEnv({ isStaticExport: true })).not.toThrow();
  });

  it('requires STELLAR_FEE_SPONSOR_SECRET in server mode', () => {
    setValidEnv();
    delete process.env.STELLAR_FEE_SPONSOR_SECRET;
    expect(() => validateEnv({ isStaticExport: false })).toThrow(
      /STELLAR_FEE_SPONSOR_SECRET is not set/,
    );
  });

  it('throws when STELLAR_FEE_SPONSOR_SECRET is not a valid secret key', () => {
    setValidEnv();
    process.env.STELLAR_FEE_SPONSOR_SECRET = 'not-a-secret-key';
    expect(() => validateEnv({ isStaticExport: false })).toThrow(
      /not a valid Stellar secret key/,
    );
  });
});

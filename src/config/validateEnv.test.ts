import { describe, expect, it } from 'vitest';
import { collectEnvWarnings } from './validateEnv';

const VALID_CONTRACT = 'C' + 'A'.repeat(55);
const VALID_ACCOUNT = 'G' + 'A'.repeat(55);

const BASE_ENV = {
  NEXT_PUBLIC_FACTORY_CONTRACT_ID: VALID_CONTRACT,
  NEXT_PUBLIC_SIMULATION_ACCOUNT: VALID_ACCOUNT,
  NEXT_PUBLIC_SOROBAN_RPC_URL: 'https://soroban-testnet.stellar.org',
  NEXT_PUBLIC_HORIZON_URL: 'https://horizon-testnet.stellar.org',
  NEXT_PUBLIC_BACKEND_API_URL: 'http://localhost:4000/api/v1',
  STELLAR_FEE_SPONSOR_SECRET: 'SABC123',
} as NodeJS.ProcessEnv;

describe('collectEnvWarnings', () => {
  it('returns no warnings when every var is present and well-formed', () => {
    expect(collectEnvWarnings(BASE_ENV)).toEqual([]);
  });

  it('warns when NEXT_PUBLIC_FACTORY_CONTRACT_ID is missing', () => {
    const warnings = collectEnvWarnings({ ...BASE_ENV, NEXT_PUBLIC_FACTORY_CONTRACT_ID: undefined });
    expect(warnings.some((w) => w.includes('NEXT_PUBLIC_FACTORY_CONTRACT_ID is not set'))).toBe(true);
  });

  it('warns when NEXT_PUBLIC_FACTORY_CONTRACT_ID is malformed', () => {
    const warnings = collectEnvWarnings({ ...BASE_ENV, NEXT_PUBLIC_FACTORY_CONTRACT_ID: 'not-a-contract-id' });
    expect(warnings.some((w) => w.includes('does not look like a valid Soroban contract address'))).toBe(true);
  });

  it('warns when NEXT_PUBLIC_SIMULATION_ACCOUNT is missing', () => {
    const warnings = collectEnvWarnings({ ...BASE_ENV, NEXT_PUBLIC_SIMULATION_ACCOUNT: undefined });
    expect(warnings.some((w) => w.includes('NEXT_PUBLIC_SIMULATION_ACCOUNT is not set'))).toBe(true);
  });

  it('warns when a URL var is malformed', () => {
    const warnings = collectEnvWarnings({ ...BASE_ENV, NEXT_PUBLIC_SOROBAN_RPC_URL: 'not a url' });
    expect(warnings.some((w) => w.includes('NEXT_PUBLIC_SOROBAN_RPC_URL') && w.includes('not a valid URL'))).toBe(
      true,
    );
  });

  it('warns when STELLAR_FEE_SPONSOR_SECRET is missing in server mode', () => {
    const warnings = collectEnvWarnings({ ...BASE_ENV, STELLAR_FEE_SPONSOR_SECRET: undefined, NEXT_EXPORT: undefined });
    expect(warnings.some((w) => w.includes('STELLAR_FEE_SPONSOR_SECRET is not set'))).toBe(true);
  });

  it('does not warn about the missing sponsor secret in static-export mode', () => {
    const warnings = collectEnvWarnings({ ...BASE_ENV, STELLAR_FEE_SPONSOR_SECRET: undefined, NEXT_EXPORT: 'true' });
    expect(warnings.some((w) => w.includes('STELLAR_FEE_SPONSOR_SECRET'))).toBe(false);
  });

  it('does not warn about optional NEXT_PUBLIC_POOL_CONTRACT_ID when unset', () => {
    const warnings = collectEnvWarnings({ ...BASE_ENV, NEXT_PUBLIC_POOL_CONTRACT_ID: undefined });
    expect(warnings.some((w) => w.includes('NEXT_PUBLIC_POOL_CONTRACT_ID'))).toBe(false);
  });
});

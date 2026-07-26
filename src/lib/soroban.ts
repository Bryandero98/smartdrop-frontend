/**
 * Comprehensive Soroban Contract Integration Layer
 * Handles all smart contract interactions for SmartDrop
 */

import {
  Contract,
  TransactionBuilder,
  BASE_FEE,
  xdr,
  Address,
  nativeToScVal,
  scValToNative,
  rpc,
  Networks,
  Transaction,
  FeeBumpTransaction,
} from '@stellar/stellar-sdk';
import {
  factoryContractId,
  horizonUrl,
  networkPassphrase,
  sorobanRpcUrl,
} from '@/config';
import { SecurityError } from './error-handler';
import { fetchAccountBalances } from './stellar';
import {
  bigintToDisplayAmount,
  parsePoolsFromNative,
  parseUserPositionFromNative,
} from './soroban-parsers';
import type {
  AssetInfo,
  PoolInfo,
  UserPosition,
} from './soroban-parsers';
export type { AssetInfo, PoolInfo, UserPosition } from './soroban-parsers';

// Soroban RPC Configuration
const RPC_URL = process.env.NEXT_PUBLIC_SOROBAN_RPC_URL || 'https://soroban-testnet.stellar.org:443';
const NETWORK_PASSPHRASE = process.env.NEXT_PUBLIC_NETWORK_PASSPHRASE || Networks.TESTNET;

// Contract Addresses (will be set via environment variables in production)
const FACTORY_CONTRACT_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_CONTRACT_ADDRESS || '';

const LEADERBOARD_API_URL = process.env.NEXT_PUBLIC_LEADERBOARD_API_URL || '';
const LEADERBOARD_LOOKBACK_LEDGERS = 120960; // ~7 days at ~5s per ledger

export type LeaderboardSortKey = 'credits' | 'stake';

export interface LeaderboardRow {
  address: string;
  totalCredits: number;
  totalStake: number;
  boostUtilization: number;
}

export interface LeaderboardPage {
  entries: LeaderboardRow[];
  total: number;
}

// Initialize Soroban RPC Server
export const rpcServer = new rpc.Server(sorobanRpcUrl);

export interface BoostConfig {
  multiplier: number;
  allocationPercentage: number;
  isActive: boolean;
}

export interface TransactionResult {
  success: boolean;
  transactionHash?: string;
  hash?: string;
  status?: string;
  error?: string;
  errorCode?: string;
  resultXdr?: string;
  gasUsed?: string;
}

export interface ContractCallOptions {
  caller?: string;
  fee?: number;
  memo?: string;
}

// ── XDR-level wrappers (pure parsing logic lives in ./soroban-parsers) ───────

export function parsePoolsFromXdrResult(xdrResult: xdr.ScVal): PoolInfo[] {
  let native: unknown;
  try {
    native = scValToNative(xdrResult);
  } catch (err) {
    console.warn('[SmartDrop] parsePoolsFromXdr: failed to deserialise ScVal:', err);
    return [];
  }
  if (!Array.isArray(native)) {
    console.warn('[SmartDrop] parsePoolsFromXdr: expected Vec (array), got', typeof native);
    return [];
  }
  return parsePoolsFromNative(native);
}

export function parseUserPositionFromXdrResult(
  xdrResult: xdr.ScVal,
  poolId: string,
  userAddress: string,
): UserPosition | null {
  let native: unknown;
  try {
    native = scValToNative(xdrResult);
  } catch (err) {
    console.warn('[SmartDrop] parseUserPositionFromXdr: failed to deserialise ScVal:', err);
    return null;
  }

  if (native == null) return null;

  if (typeof native !== 'object' || Array.isArray(native)) {
    console.warn('[SmartDrop] parseUserPositionFromXdr: expected Map (object), got', typeof native);
    return null;
  }

  return parseUserPositionFromNative(native as Record<string, unknown>, poolId, userAddress);
}

export function parseCreditsFromXdrResult(xdrResult: xdr.ScVal): string {
  try {
    const native = scValToNative(xdrResult);
    return bigintToDisplayAmount(native);
  } catch (err) {
    console.warn('[SmartDrop] parseCreditsFromXdr: failed to parse:', err);
    return '0';
  }
}



type FreighterSignTransactionResult =
  | string
  | {
      signedTxXdr?: string;
      signerAddress?: string;
      error?: unknown;
    };

export interface FreighterWalletApi {
  signTransaction: (
    transactionXdr: string,
    options: { networkPassphrase: string },
  ) => Promise<FreighterSignTransactionResult>;
}

type LockAssetsStep = 'simulating' | 'signing' | 'submitting';
type UnlockAssetsStep = 'signing' | 'submitting' | 'confirming';

export interface LockAssetsCallbacks {
  onHash?: (hash: string) => void;
  onStep?: (step: LockAssetsStep) => void;
}

export interface UnlockAssetsCallbacks {
  onHash?: (hash: string) => void;
  onStep?: (step: UnlockAssetsStep) => void;
}

export interface BuildLockAssetsTransactionArgs {
  poolContractId: string;
  publicKey: string;
  amount: string;
}

export type LockAssetsRpc = Pick<
  rpc.Server,
  'getAccount' | 'simulateTransaction'
>;

export function amountToStroops(amount: string, decimals = 7): bigint {
  const normalized = amount.trim();
  if (!Number.isInteger(decimals) || decimals < 0) {
    throw new Error('Decimal precision must be a non-negative integer.');
  }

  if (!/^\d+(?:\.\d+)?$/.test(normalized)) {
    throw new Error('Enter a valid positive decimal amount.');
  }

  const [whole, fraction = ''] = normalized.split('.');
  if (fraction.length > decimals) {
    throw new Error(`Amount supports at most ${decimals} decimal places.`);
  }

  const scale = 10n ** BigInt(decimals);
  const stroops =
    BigInt(whole) * scale +
    BigInt((fraction || '0').padEnd(decimals, '0'));

  if (stroops <= 0n) {
    throw new Error('Amount must be greater than 0.');
  }

  return stroops;
}

export async function getStellarBalance(publicKey: string): Promise<number> {
  const response = await fetch(
    `${horizonUrl.replace(/\/$/, '')}/accounts/${publicKey}`,
  );

  if (!response.ok) {
    throw new Error(
      `Unable to fetch Stellar balance from Horizon (${response.status}).`,
    );
  }

  const account = (await response.json()) as {
    balances?: Array<{
      asset_type?: string;
      balance?: string;
    }>;
  };
  const nativeBalance = account.balances?.find(
    (balance) => balance.asset_type === 'native',
  );

  if (!nativeBalance?.balance) {
    throw new Error('Horizon account response did not include a native XLM balance.');
  }

  return Number(nativeBalance.balance);
}

/**
 * Wraps an inner transaction in a fee-bump transaction sponsored by a sponsor.
 */
export function buildFeeBumpTransaction(
  innerTx: Transaction | string,
  sponsorPublicKey: string,
  networkPassphrase: string,
): FeeBumpTransaction {
  const txObj = typeof innerTx === 'string'
    ? TransactionBuilder.fromXDR(innerTx, networkPassphrase) as Transaction
    : innerTx;

  const innerOps = txObj.operations.length || 1;
  const innerFee = typeof txObj.fee === 'string' ? parseInt(txObj.fee, 10) : Number(txObj.fee);
  const baseFee = Math.max(100, Math.ceil(innerFee / innerOps));

  return TransactionBuilder.buildFeeBumpTransaction(
    sponsorPublicKey,
    String(baseFee),
    txObj,
    networkPassphrase,
  );
}

export async function buildLockAssetsTransaction(
  args: BuildLockAssetsTransactionArgs,
  rpcOverride?: LockAssetsRpc,
) {
  const server = rpcOverride ?? rpcServer;
  const account = await server.getAccount(args.publicKey);
  const contract = new Contract(args.poolContractId);
  const operation = contract.call(
    'lock_assets',
    Address.fromString(args.publicKey).toScVal(),
    nativeToScVal(amountToStroops(args.amount), { type: 'i128' }),
  );

  return new TransactionBuilder(account, {
    fee: BASE_FEE,
    networkPassphrase,
  })
    .addOperation(operation)
    .setTimeout(300)
    .build();
}

export async function simulateLockAssets(
  args: BuildLockAssetsTransactionArgs,
  rpcOverride?: LockAssetsRpc,
) {
  const server = rpcOverride ?? rpcServer;
  const transaction = await buildLockAssetsTransaction(args, server);
  const simulation = await server.simulateTransaction(transaction);

  if ('error' in simulation) {
    throw new Error(`Simulation failed: ${simulation.error}`);
  }

  return {
    transaction,
    simulation,
    feePreview: String(simulation.minResourceFee ?? '0'),
  };
}

function getSignedTransactionXdr(
  result: FreighterSignTransactionResult,
): string {
  if (typeof result === 'string') {
    return result;
  }

  if (result.error) {
    throw new Error(
      typeof result.error === 'string'
        ? result.error
        : 'Freighter failed to sign the transaction',
    );
  }

  if (result.signedTxXdr) {
    return result.signedTxXdr;
  }

  throw new Error('Freighter did not return a signed transaction XDR');
}

type PollTransactionResult = {
  status: 'SUCCESS' | 'FAILED' | 'TIMEOUT';
  resultXdr?: string;
  errorCode?: string;
};

const CONTRACT_ERROR_MESSAGES: Record<string, string> = {
  '1': 'Assets are still locked',
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeResultXdr(resultXdr: unknown): string | undefined {
  if (!resultXdr) return undefined;
  if (typeof resultXdr === 'string') return resultXdr;
  if (
    typeof resultXdr === 'object' &&
    resultXdr !== null &&
    'toXDR' in resultXdr &&
    typeof (resultXdr as { toXDR: (format: 'base64') => unknown }).toXDR === 'function'
  ) {
    const encoded = (resultXdr as { toXDR: (format: 'base64') => unknown }).toXDR('base64');
    return typeof encoded === 'string' ? encoded : undefined;
  }
  return undefined;
}

function normalizeTransactionStatus(status: unknown): string {
  return enumName(status).toUpperCase();
}

function normalizeContractErrorCode(value: unknown): string | undefined {
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value !== 'string') return undefined;

  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return trimmed;
  const hexMatch = trimmed.match(/0x([0-9a-f]+)/i);
  if (hexMatch) return String(Number.parseInt(hexMatch[1], 16));
  const decimalMatch = trimmed.match(/(?:contract[_\s-]?code|error[_\s-]?code|code)[^\d]*(\d+)/i);
  return decimalMatch?.[1];
}

function findContractErrorCode(
  value: unknown,
  depth = 0,
  seen = new WeakSet<object>(),
): string | undefined {
  if (depth > 8 || value == null) return undefined;

  if (typeof value === 'object') {
    if (seen.has(value)) return undefined;
    seen.add(value);

    const xdrLike = value as {
      switch?: () => unknown;
      value?: () => unknown;
    };
    if (typeof xdrLike.switch === 'function') {
      const armName = enumName(xdrLike.switch());
      if (armName === 'sceContract' && typeof xdrLike.value === 'function') {
        return normalizeContractErrorCode(xdrLike.value());
      }
    }

    for (const method of [
      'contractCode',
      'errorCode',
      'code',
      'value',
      'result',
      'results',
      'tr',
      'invokeHostFunction',
    ]) {
      const accessor = (value as Record<string, unknown>)[method];
      if (typeof accessor !== 'function') continue;

      try {
        const raw = accessor.call(value);
        const directCode = /^(contractCode|errorCode|code)$/.test(method)
          ? normalizeContractErrorCode(raw)
          : undefined;
        if (directCode) return directCode;

        const code = findContractErrorCode(raw, depth + 1, seen);
        if (code) return code;
      } catch {
        // Ignore accessors that are not valid for this XDR union arm.
      }
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        const code = findContractErrorCode(item, depth + 1, seen);
        if (code) return code;
      }
      return undefined;
    }

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      if (!/(contract|error|code|result)/i.test(key)) continue;
      const directCode = normalizeContractErrorCode(item);
      if (directCode) return directCode;
      const nestedCode = findContractErrorCode(item, depth + 1, seen);
      if (nestedCode) return nestedCode;
    }
  }

  return undefined;
}

function extractContractErrorCodeFromXdr(resultXdr?: string): string | undefined {
  if (!resultXdr) return undefined;

  for (const decoder of [xdr.TransactionResult, xdr.ScError]) {
    try {
      const decoded = decoder.fromXDR(resultXdr, 'base64');
      const code = findContractErrorCode(decoded);
      if (code) return code;
    } catch {
      // The result might not be this XDR type.
    }
  }

  return normalizeContractErrorCode(resultXdr);
}

function extractContractErrorCode(tx: unknown, resultXdr?: string): string | undefined {
  const directCode = findContractErrorCode(tx);
  if (directCode) return directCode;

  if (tx && typeof tx === 'object') {
    const rawResultXdr = normalizeResultXdr((tx as { resultXdr?: unknown }).resultXdr);
    const code = extractContractErrorCodeFromXdr(rawResultXdr);
    if (code) return code;
  }

  return extractContractErrorCodeFromXdr(resultXdr);
}

export function getContractErrorMessage(errorCode?: string): string | undefined {
  const normalized = normalizeContractErrorCode(errorCode);
  return normalized ? CONTRACT_ERROR_MESSAGES[normalized] : undefined;
}

// ── Transaction signing safety ───────────────────────────────────────────────

export interface ExpectedSimulationAuth {
  contractId: string;
  functionName: string;
}

type SimulationAuthResult = {
  result?: {
    auth?: xdr.SorobanAuthorizationEntry[] | null;
  } | null;
};

function normalizeExpectedAuthKey(auth: ExpectedSimulationAuth): string {
  return `${auth.contractId.trim().toUpperCase()}:${auth.functionName.trim()}`;
}

function enumName(value: unknown): string {
  if (typeof value === 'string') return value;

  if (value && typeof value === 'object') {
    const enumLike = value as { name?: unknown; toString?: () => string };

    if (typeof enumLike.name === 'string') return enumLike.name;
    if (typeof enumLike.name === 'function') {
      const name = (enumLike.name as () => unknown)();
      if (typeof name === 'string') return name;
    }
    if (typeof enumLike.toString === 'function') return enumLike.toString();
  }

  return String(value);
}

function scSymbolToString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  if (value && typeof value === 'object' && 'toString' in value) {
    return String((value as { toString: () => string }).toString());
  }
  return String(value);
}

function decodeAuthEntryContractFunction(
  entry: xdr.SorobanAuthorizationEntry,
): ExpectedSimulationAuth {
  try {
    const authEntry = entry as unknown as {
      credentials?: () => unknown;
      rootInvocation?: () => unknown;
    };

    // Decode/access credentials as part of validating the full authorization entry shape.
    // The target contract/function is carried by rootInvocation.contractFn.
    if (typeof authEntry.credentials !== 'function') {
      throw new Error('Authorization entry is missing credentials');
    }
    authEntry.credentials();

    if (typeof authEntry.rootInvocation !== 'function') {
      throw new Error('Authorization entry is missing root invocation');
    }

    const invocation = authEntry.rootInvocation() as {
      function?: () => unknown;
      subInvocations?: () => unknown;
    };

    if (!invocation || typeof invocation.function !== 'function') {
      throw new Error('Authorization entry root invocation is malformed');
    }

    const authorizedFunction = invocation.function() as {
      switch?: () => unknown;
      contractFn?: () => unknown;
    };

    const functionType =
      typeof authorizedFunction.switch === 'function'
        ? enumName(authorizedFunction.switch())
        : '';

    if (!functionType.toLowerCase().includes('contract')) {
      throw new Error(`Unexpected authorization function type: ${functionType}`);
    }

    if (typeof authorizedFunction.contractFn !== 'function') {
      throw new Error('Authorization entry does not contain a contract function');
    }

    const contractFn = authorizedFunction.contractFn() as {
      contractAddress?: () => xdr.ScAddress;
      functionName?: () => unknown;
    };

    if (
      !contractFn ||
      typeof contractFn.contractAddress !== 'function' ||
      typeof contractFn.functionName !== 'function'
    ) {
      throw new Error('Authorization contract function is malformed');
    }

    const decoded = {
      contractId: Address.fromScAddress(contractFn.contractAddress()).toString(),
      functionName: scSymbolToString(contractFn.functionName()),
    };
    assertNoUnexpectedSubInvocations(invocation);

    return decoded;
  } catch (error) {
    if (error instanceof SecurityError) {
      throw error;
    }

    throw new SecurityError(
      'Transaction signing was blocked because SmartDrop could not verify the simulated authorization request.',
      error instanceof Error ? error : undefined,
    );
  }
}

function assertNoUnexpectedSubInvocations(invocation: {
  subInvocations?: () => unknown;
}): void {
  if (typeof invocation.subInvocations !== 'function') {
    throw new SecurityError(
      'Transaction signing was blocked because SmartDrop could not verify nested authorization requests.',
    );
  }

  const subInvocations = invocation.subInvocations();
  if (!Array.isArray(subInvocations)) {
    throw new SecurityError(
      'Transaction signing was blocked because SmartDrop could not verify nested authorization requests.',
    );
  }

  if (subInvocations.length > 0) {
    throw new SecurityError(
      'Transaction signing was blocked because the simulation returned nested authorization requests that SmartDrop did not expect.',
    );
  }
}

export function validateSimulationAuth(
  simResult: SimulationAuthResult,
  expected: ExpectedSimulationAuth[],
): void {
  const authEntries = simResult.result?.auth;

  if (!Array.isArray(authEntries)) {
    throw new SecurityError(
      'Transaction signing was blocked because the simulation did not return authorization entries.',
    );
  }

  if (authEntries.length !== expected.length) {
    throw new SecurityError(
      `Transaction signing was blocked because the simulation returned ${authEntries.length} authorization entr${authEntries.length === 1 ? 'y' : 'ies'}, but SmartDrop expected ${expected.length}.`,
    );
  }

  const remainingExpected = expected.map((entry) => normalizeExpectedAuthKey(entry));

  for (const entry of authEntries) {
    const actual = decodeAuthEntryContractFunction(entry);
    const actualKey = normalizeExpectedAuthKey(actual);
    const matchIndex = remainingExpected.indexOf(actualKey);

    if (matchIndex === -1) {
      throw new SecurityError(
        `Transaction signing was blocked because the simulated authorization targets ${actual.contractId}.${actual.functionName}, which is not expected for this SmartDrop action.`,
      );
    }

    remainingExpected.splice(matchIndex, 1);
  }

  if (remainingExpected.length > 0) {
    throw new SecurityError(
      'Transaction signing was blocked because the simulation is missing an expected SmartDrop authorization entry.',
    );
  }
}

// ── SorobanService class ──────────────────────────────────────────────────────

/**
 * SorobanService class - Main interface for contract interactions
 */
export class SorobanService {
  private rpcServer: rpc.Server;
  private factoryContract?: Contract;
  private poolContracts: Map<string, Contract> = new Map();

  constructor() {
    this.rpcServer = rpcServer;
    if (factoryContractId) {
      this.factoryContract = new Contract(factoryContractId);
    }
  }

  /**
   * Initialize the service with contract addresses
   */
  async initialize(factoryAddress?: string) {
    if (factoryAddress) {
      this.factoryContract = new Contract(factoryAddress);
    }
    
    // Load existing pools
    await this.loadPoolContracts();
  }

  /**
   * Load all pool contracts from the factory
   */
  private async loadPoolContracts() {
    try {
      const pools = await this.getFactoryPools();
      pools.forEach(pool => {
        const contract = new Contract(pool.contractAddress);
        this.poolContracts.set(pool.id, contract);
        this.poolContracts.set(pool.contractAddress, contract);
      });
    } catch (error) {
      console.warn('Failed to load pool contracts:', error);
    }
  }

  /**
   * Get all pools from the factory contract
   */
  async getFactoryPools(): Promise<PoolInfo[]> {
    if (!this.factoryContract) {
      console.warn('Factory contract not initialized; returning empty pool list');
      return [];
    }

    try {
      const call = this.factoryContract.call("get_pools");

      const account = await this.rpcServer.getAccount(
        'GBQ3WPTHKJ5XKWLOKUZJLZL2GVXR6RWQCXUVDQZWM7Q2YNLDRVGM5ZWJ'
      );
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(call)
        .setTimeout(30)
        .build();

      const simulation = await this.rpcServer.simulateTransaction(transaction);

      if ("error" in simulation) {
        throw new Error(`Simulation failed: ${simulation.error}`);
      }

      const result = simulation.result?.retval;
      if (!result) {
        return [];
      }

      return this.parsePoolsFromXdr(result);
    } catch (error) {
      console.error('Error fetching factory pools:', error);
      return [];
    }
  }

  /**
   * Get user position for a specific pool
   */
  async getUserPosition(
    poolId: string,
    userAddress: string
  ): Promise<UserPosition | null> {
    const poolContract = this.poolContracts.get(poolId);
    if (!poolContract) {
      console.warn(`Pool contract not found for ID: ${poolId}`);
      return null;
    }

    try {
      const call = poolContract.call(
        "get_user_position",
        Address.fromString(userAddress).toScVal(),
      );

      const account = await this.rpcServer.getAccount(
        'GBQ3WPTHKJ5XKWLOKUZJLZL2GVXR6RWQCXUVDQZWM7Q2YNLDRVGM5ZWJ'
      );
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(call)
        .setTimeout(30)
        .build();

      const simulation = await this.rpcServer.simulateTransaction(transaction);

      if ("error" in simulation) {
        throw new Error(`Failed to get user position: ${simulation.error}`);
      }

      const result = simulation.result?.retval;
      if (!result) {
        return null;
      }

      return this.parseUserPositionFromXdr(result, poolId, userAddress);
    } catch (error) {
      console.error('Error fetching user position:', error);
      return null;
    }
  }

  /**
   * Calculate user credits for a specific pool
   */
  async calculateUserCredits(
    poolId: string,
    userAddress: string
  ): Promise<string> {
    const poolContract = this.poolContracts.get(poolId);
    if (!poolContract) {
      console.warn(`Pool contract not found for ID: ${poolId}`);
      return '0';
    }

    try {
      const call = poolContract.call(
        "calculate_credits",
        Address.fromString(userAddress).toScVal(),
      );

      const account = await this.rpcServer.getAccount(
        'GBQ3WPTHKJ5XKWLOKUZJLZL2GVXR6RWQCXUVDQZWM7Q2YNLDRVGM5ZWJ'
      );
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(call)
        .setTimeout(30)
        .build();

      const simulation = await this.rpcServer.simulateTransaction(transaction);

      if ("error" in simulation) {
        throw new Error(`Failed to calculate credits: ${simulation.error}`);
      }

      const result = simulation.result?.retval;
      if (!result) {
        return '0';
      }

      return this.parseCreditsFromXdr(result);
    } catch (error) {
      console.error('Error calculating credits:', error);
      return '0';
    }
  }

  /**
   * Resolve a pool contract from the cache or directly from a contract address.
   * Falls back to constructing a Contract on the fly when the pool was discovered
   * outside the factory (e.g. via the NEXT_PUBLIC_POOL_CONTRACT_ID env var).
   */
  private resolvePoolContract(poolId: string): Contract {
    const cached = this.poolContracts.get(poolId);
    if (cached) return cached;
    // Stellar contract IDs start with 'C' and are 56 characters long.
    if (poolId.startsWith('C') && poolId.length >= 56) {
      const contract = new Contract(poolId);
      this.poolContracts.set(poolId, contract);
      return contract;
    }
    throw new Error(`Pool contract not found for ID: ${poolId}`);
  }

  private async pollTransactionStatus(
    hash: string,
    timeoutMs = 30000,
  ): Promise<PollTransactionResult> {
    const startedAt = Date.now();
    let delayMs = 1000;

    while (Date.now() - startedAt < timeoutMs) {
      const tx = await this.rpcServer.getTransaction(hash);
      const status = normalizeTransactionStatus(tx.status);
      const resultXdr = normalizeResultXdr('resultXdr' in tx ? tx.resultXdr : undefined);

      if (status === 'SUCCESS') {
        return {
          status: 'SUCCESS',
          resultXdr,
        };
      }

      if (status === 'FAILED') {
        return {
          status: 'FAILED',
          resultXdr,
          errorCode: extractContractErrorCode(tx, resultXdr),
        };
      }

      const elapsedMs = Date.now() - startedAt;
      const remainingMs = timeoutMs - elapsedMs;
      if (remainingMs <= 0) break;

      await sleep(Math.min(delayMs, remainingMs));
      delayMs = Math.min(delayMs * 2, 5000);
    }

    return { status: 'TIMEOUT' };
  }

  async lockAssets(
    poolId: string,
    userAddress: string,
    amount: string,
    walletApi: FreighterWalletApi,
    callbacks?: LockAssetsCallbacks,
  ): Promise<TransactionResult> {
    try {
      // Check if sponsored fee-bump is needed
      let isFeeSponsored = false;
      const sponsorPublicKey = process.env.NEXT_PUBLIC_FEE_SPONSOR_PUBLIC_KEY;
      if (sponsorPublicKey) {
        try {
          const balances = await fetchAccountBalances(userAddress);
          const nativeBal = balances.find((b) => b.asset_type === 'native');
          const xlmAmount = nativeBal ? parseFloat(nativeBal.balance) : 0;
          if (xlmAmount < 1.0) {
            isFeeSponsored = true;
          }
        } catch (err) {
          console.warn('[SmartDrop] Failed to check XLM balance, defaulting to normal flow:', err);
        }
      }

      callbacks?.onStep?.('simulating');
      const poolContract = this.resolvePoolContract(poolId);
      const { transaction, simulation, feePreview } = await simulateLockAssets(
        {
          poolContractId: poolContract.contractId(),
          publicKey: userAddress,
          amount,
        },
        this.rpcServer,
      );

      validateSimulationAuth(simulation, [
        {
          contractId: poolContract.contractId(),
          functionName: 'lock_assets',
        },
      ]);

      const preparedTransaction = rpc.assembleTransaction(transaction, simulation).build();

      callbacks?.onStep?.('signing');
      const signedTransaction = getSignedTransactionXdr(
        await walletApi.signTransaction(preparedTransaction.toXDR(), {
          networkPassphrase,
        }),
      );

      let finalTxXdr = signedTransaction;
      if (isFeeSponsored) {
        const response = await fetch('/api/sign-fee-bump', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ innerTxXdr: signedTransaction }),
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Fee sponsor failed: ${errText}`);
        }
        const resData = await response.json();
        if (!resData.feeBumpTxXdr) {
          throw new Error('Sponsor API returned invalid response');
        }
        finalTxXdr = resData.feeBumpTxXdr;
      }

      callbacks?.onStep?.('submitting');
      const submissionResult = await this.rpcServer.sendTransaction(
        TransactionBuilder.fromXDR(finalTxXdr, networkPassphrase),
      );

      if (submissionResult.status === 'ERROR') {
        return {
          success: false,
          status: submissionResult.status,
          error: `Transaction failed: ${submissionResult.errorResult}`,
        };
      }

      callbacks?.onHash?.(submissionResult.hash);
      const confirmation = await this.pollTransactionStatus(submissionResult.hash);
      if (confirmation.status !== 'SUCCESS') {
        return {
          success: false,
          transactionHash: submissionResult.hash,
          hash: submissionResult.hash,
          status: confirmation.status,
          resultXdr: confirmation.resultXdr,
          errorCode: confirmation.errorCode,
          error:
            confirmation.status === 'TIMEOUT'
              ? 'Transaction confirmation is taking longer than expected.'
              : getContractErrorMessage(confirmation.errorCode) ??
                `Transaction ${submissionResult.hash} failed on-chain`,
        };
      }

      return {
        success: true,
        transactionHash: submissionResult.hash,
        hash: submissionResult.hash,
        status: confirmation.status,
        resultXdr: confirmation.resultXdr,
        gasUsed: feePreview,
      };

    } catch (error) {
      console.error('Error locking assets:', error);
      if (error instanceof SecurityError) {
        throw error;
      }
      return {
        success: false,
        status: 'FAILED',
        error: error instanceof Error ? error.message : 'Unknown error locking assets',
      };
    }
  }

  /**
   * Unlock assets from a pool
   */
  async unlockAssets(
    poolId: string,
    userAddress: string,
    amount: string,
    walletApi: FreighterWalletApi,
    callbacks?: UnlockAssetsCallbacks,
  ): Promise<TransactionResult> {
    const poolContract = this.resolvePoolContract(poolId);

    try {
      // Check if sponsored fee-bump is needed
      let isFeeSponsored = false;
      const sponsorPublicKey = process.env.NEXT_PUBLIC_FEE_SPONSOR_PUBLIC_KEY;
      if (sponsorPublicKey) {
        try {
          const balances = await fetchAccountBalances(userAddress);
          const nativeBal = balances.find((b) => b.asset_type === 'native');
          const xlmAmount = nativeBal ? parseFloat(nativeBal.balance) : 0;
          if (xlmAmount < 1.0) {
            isFeeSponsored = true;
          }
        } catch (err) {
          console.warn('[SmartDrop] Failed to check XLM balance, defaulting to normal flow:', err);
        }
      }

      const call = poolContract.call(
        "unlock_assets",
        Address.fromString(userAddress).toScVal(),
        nativeToScVal(BigInt(amount), { type: "i128" }),
      );

      const account = await this.rpcServer.getAccount(userAddress);
      
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(call)
        .setTimeout(300)
        .build();

      const simulation = await this.rpcServer.simulateTransaction(transaction);
      
      if ("error" in simulation) {
        return {
          success: false,
          error: `Simulation failed: ${simulation.error}`,
        };
      }

      validateSimulationAuth(simulation, [
        {
          contractId: poolContract.contractId(),
          functionName: 'unlock_assets',
        },
      ]);

      const preparedTransaction = rpc.assembleTransaction(transaction, simulation).build();

      callbacks?.onStep?.('signing');
      const signedTransaction = getSignedTransactionXdr(
        await walletApi.signTransaction(preparedTransaction.toXDR(), {
          networkPassphrase,
        }),
      );

      let finalTxXdr = signedTransaction;
      if (isFeeSponsored) {
        const response = await fetch('/api/sign-fee-bump', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ innerTxXdr: signedTransaction }),
        });
        if (!response.ok) {
          const errText = await response.text();
          throw new Error(`Fee sponsor failed: ${errText}`);
        }
        const resData = await response.json();
        if (!resData.feeBumpTxXdr) {
          throw new Error('Sponsor API returned invalid response');
        }
        finalTxXdr = resData.feeBumpTxXdr;
      }

      callbacks?.onStep?.('submitting');
      const submissionResult = await this.rpcServer.sendTransaction(
        TransactionBuilder.fromXDR(finalTxXdr, networkPassphrase),
      );

      if (submissionResult.status === 'ERROR') {
        return {
          success: false,
          error: `Transaction failed: ${submissionResult.errorResult}`,
        };
      }

      callbacks?.onHash?.(submissionResult.hash);
      callbacks?.onStep?.('confirming');
      const confirmation = await this.pollTransactionStatus(submissionResult.hash);
      if (confirmation.status !== 'SUCCESS') {
        return {
          success: false,
          transactionHash: submissionResult.hash,
          hash: submissionResult.hash,
          status: confirmation.status,
          resultXdr: confirmation.resultXdr,
          errorCode: confirmation.errorCode,
          error:
            confirmation.status === 'TIMEOUT'
              ? 'Transaction confirmation is taking longer than expected.'
              : getContractErrorMessage(confirmation.errorCode) ??
                `Transaction ${submissionResult.hash} failed on-chain`,
        };
      }

      return {
        success: true,
        transactionHash: submissionResult.hash,
        hash: submissionResult.hash,
        status: confirmation.status,
        resultXdr: confirmation.resultXdr,
        gasUsed: simulation.minResourceFee || '0',
      };

    } catch (error) {
      console.error('Error unlocking assets:', error);
      if (error instanceof SecurityError) {
        throw error;
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Set boost configuration for a user
   */
  async setBoost(
    poolId: string,
    userAddress: string,
    allocationPercentage: number,
    walletApi: FreighterWalletApi
  ): Promise<TransactionResult> {
    const poolContract = this.resolvePoolContract(poolId);

    if (allocationPercentage < 0 || allocationPercentage > 100) {
      return {
        success: false,
        error: 'Allocation percentage must be between 0 and 100',
      };
    }

    try {
      const call = poolContract.call(
        "set_boost",
        Address.fromString(userAddress).toScVal(),
        nativeToScVal(allocationPercentage, { type: "u32" }),
      );

      const account = await this.rpcServer.getAccount(userAddress);
      
      const transaction = new TransactionBuilder(account, {
        fee: BASE_FEE,
        networkPassphrase,
      })
        .addOperation(call)
        .setTimeout(300)
        .build();

      const simulation = await this.rpcServer.simulateTransaction(transaction);
      
      if ("error" in simulation) {
        return {
          success: false,
          error: `Simulation failed: ${simulation.error}`,
        };
      }

      validateSimulationAuth(simulation, [
        {
          contractId: poolContract.contractId(),
          functionName: 'set_boost',
        },
      ]);

      const preparedTransaction = rpc.assembleTransaction(transaction, simulation).build();

      const signedTransaction = getSignedTransactionXdr(
        await walletApi.signTransaction(preparedTransaction.toXDR(), {
          networkPassphrase,
        }),
      );

      const submissionResult = await this.rpcServer.sendTransaction(
        TransactionBuilder.fromXDR(signedTransaction, networkPassphrase),
      );

      if (submissionResult.status === 'ERROR') {
        return {
          success: false,
          error: `Transaction failed: ${submissionResult.errorResult}`,
        };
      }

      return {
        success: true,
        transactionHash: submissionResult.hash,
        hash: submissionResult.hash,
        gasUsed: simulation.minResourceFee || '0',
      };
      
    } catch (error) {
      console.error('Error setting boost:', error);
      if (error instanceof SecurityError) {
        throw error;
      }
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get total platform statistics
   */
  async getPlatformStats(): Promise<{
    totalValueLocked: string;
    totalUsers: number;
    onlineUsers: number;
    totalPools: number;
  }> {
    try {
      const pools = await this.getFactoryPools();
      
      let totalTVL = 0;
      let totalUsers = 0;
      
      pools.forEach(pool => {
        totalTVL += parseFloat(pool.totalLocked);
        totalUsers += pool.totalUsers;
      });

      return {
        totalValueLocked: totalTVL.toLocaleString('en-US', {
          style: 'currency',
          currency: 'USD',
          minimumFractionDigits: 0,
          maximumFractionDigits: 0,
        }),
        totalUsers,
        onlineUsers: Math.floor(totalUsers * 0.1),
        totalPools: pools.length,
      };
    } catch (error) {
      console.error('Error fetching platform stats:', error);
      return {
        totalValueLocked: '$0',
        totalUsers: 0,
        onlineUsers: 0,
        totalPools: 0,
      };
    }
  }

  /**
   * Get 7-day TVL history for a pool by scanning lock/unlock events.
   * Returns synthetic daily snapshots derived from on-chain events.
   * Falls back to empty array if the RPC is unreachable.
   */
  async getPoolHistory(
    poolId: string,
    days: number = 7,
  ): Promise<{ date: string; tvl: string }[]> {
    try {
      const latest = await this.rpcServer.getLatestLedger();
      // ~5 s per ledger; days * 86400 / 5
      const ledgersPerDay = Math.floor(86400 / 5);
      const startLedger = Math.max(1, latest.sequence - days * ledgersPerDay);

      const { xdr, scValToNative } = await import('@stellar/stellar-sdk');
      const lockSym = xdr.ScVal.scvSymbol('lock_assets').toXDR('base64');
      const unlockSym = xdr.ScVal.scvSymbol('unlock_assets').toXDR('base64');

      const response = await this.rpcServer.getEvents({
        startLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [poolId],
            topics: [[lockSym, '*'], [unlockSym, '*']],
          },
        ],
        limit: 500,
      });

      // Build a running TVL map keyed by ISO date string
      const dailyMap = new Map<string, number>();
      let runningTvl = 0;

      // Seed today and past N days so chart always has points
      for (let i = days - 1; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i);
        dailyMap.set(d.toISOString().slice(0, 10), 0);
      }

      for (const evt of response.events) {
        if (!evt.inSuccessfulContractCall) continue;
        const topics = (evt.topic as import('@stellar/stellar-sdk').xdr.ScVal[]).map(scValToNative);
        const action = topics[0] as string;
        const valueNative = scValToNative(evt.value as import('@stellar/stellar-sdk').xdr.ScVal);
        let amount = 0;
        if (Array.isArray(valueNative)) amount = Number(valueNative[0] ?? 0);
        else if (valueNative && typeof valueNative === 'object') {
          amount = Number((valueNative as Record<string, unknown>)['amount'] ?? 0);
        }
        const amountDisplay = amount / 10_000_000;
        if (action === 'lock_assets') runningTvl += amountDisplay;
        else if (action === 'unlock_assets') runningTvl = Math.max(0, runningTvl - amountDisplay);

        const dateKey = (evt.ledgerClosedAt as string).slice(0, 10);
        if (dailyMap.has(dateKey)) dailyMap.set(dateKey, runningTvl);
      }

      return Array.from(dailyMap.entries())
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, tvl]) => ({ date, tvl: String(tvl) }));
    } catch (err) {
      console.warn('[SmartDrop] getPoolHistory failed:', err);
      return [];
    }
  }

  /**
   * Get top N depositors for a pool by scanning lock events.
   * Returns depositors sorted by amount descending.
   * Falls back to empty array if the RPC is unreachable.
   */
  async getPoolDepositors(
    poolId: string,
    limit: number = 20,
  ): Promise<{ address: string; amount: string; credits: string }[]> {
    try {
      const latest = await this.rpcServer.getLatestLedger();
      const startLedger = Math.max(1, latest.sequence - 120960); // ~7 days

      const { xdr, scValToNative } = await import('@stellar/stellar-sdk');
      const lockSym = xdr.ScVal.scvSymbol('lock_assets').toXDR('base64');
      const unlockSym = xdr.ScVal.scvSymbol('unlock_assets').toXDR('base64');

      const response = await this.rpcServer.getEvents({
        startLedger,
        filters: [
          {
            type: 'contract',
            contractIds: [poolId],
            topics: [[lockSym, '*'], [unlockSym, '*']],
          },
        ],
        limit: 500,
      });

      const balances = new Map<string, number>();

      for (const evt of response.events) {
        if (!evt.inSuccessfulContractCall) continue;
        const topics = (evt.topic as import('@stellar/stellar-sdk').xdr.ScVal[]).map(scValToNative);
        const action = topics[0] as string;
        const address = String(topics[1] ?? '');
        if (!address) continue;

        const valueNative = scValToNative(evt.value as import('@stellar/stellar-sdk').xdr.ScVal);
        let amount = 0;
        if (Array.isArray(valueNative)) amount = Number(valueNative[0] ?? 0);
        else if (valueNative && typeof valueNative === 'object') {
          amount = Number((valueNative as Record<string, unknown>)['amount'] ?? 0);
        }
        const amountDisplay = amount / 10_000_000;

        const current = balances.get(address) ?? 0;
        if (action === 'lock_assets') balances.set(address, current + amountDisplay);
        else if (action === 'unlock_assets') balances.set(address, Math.max(0, current - amountDisplay));
      }

      return Array.from(balances.entries())
        .filter(([, amt]) => amt > 0)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([address, amount]) => ({
          address,
          amount: amount.toLocaleString(undefined, { maximumFractionDigits: 7 }),
          credits: '—',
        }));
    } catch (err) {
      console.warn('[SmartDrop] getPoolDepositors failed:', err);
      return [];
    }
  }

  /**
   * Fetch one page of the leaderboard. Prefers the backend indexer
   * (NEXT_PUBLIC_LEADERBOARD_API_URL); otherwise derives it from on-chain events.
   */
  async getLeaderboard(
    offset: number,
    limit: number,
    sortKey: LeaderboardSortKey = 'credits',
  ): Promise<LeaderboardPage> {
    if (LEADERBOARD_API_URL) {
      try {
        return await this.fetchLeaderboardFromApi(offset, limit, sortKey);
      } catch (err) {
        console.warn('[SmartDrop] leaderboard API failed, falling back to event scan:', err);
      }
    }
    return this.fetchLeaderboardFromEvents(offset, limit, sortKey);
  }

  private async fetchLeaderboardFromApi(
    offset: number,
    limit: number,
    sortKey: LeaderboardSortKey,
  ): Promise<LeaderboardPage> {
    const url = new URL(LEADERBOARD_API_URL);
    url.searchParams.set('offset', String(offset));
    url.searchParams.set('limit', String(limit));
    url.searchParams.set('sort', sortKey);

    const res = await fetch(url.toString(), { headers: { accept: 'application/json' } });
    if (!res.ok) throw new Error(`Leaderboard API responded ${res.status}`);

    const data = (await res.json()) as {
      entries?: Array<Partial<LeaderboardRow>>;
      total?: number;
    };
    const entries: LeaderboardRow[] = (data.entries ?? []).map((e) => ({
      address: String(e.address ?? ''),
      totalCredits: Number(e.totalCredits ?? 0),
      totalStake: Number(e.totalStake ?? 0),
      boostUtilization: Number(e.boostUtilization ?? 0),
    }));
    return { entries, total: Number(data.total ?? entries.length) };
  }

  private async fetchLeaderboardFromEvents(
    offset: number,
    limit: number,
    sortKey: LeaderboardSortKey,
  ): Promise<LeaderboardPage> {
    const poolIds = await this.getLeaderboardPoolIds();
    if (poolIds.length === 0) return { entries: [], total: 0 };

    try {
      const latest = await this.rpcServer.getLatestLedger();
      const startLedger = Math.max(1, latest.sequence - LEADERBOARD_LOOKBACK_LEDGERS);

      const lockSym = xdr.ScVal.scvSymbol('lock_assets').toXDR('base64');
      const unlockSym = xdr.ScVal.scvSymbol('unlock_assets').toXDR('base64');
      const creditSym = xdr.ScVal.scvSymbol('update_credits').toXDR('base64');

      const response = await this.rpcServer.getEvents({
        startLedger,
        filters: [
          {
            type: 'contract',
            contractIds: poolIds,
            topics: [[lockSym, '*'], [unlockSym, '*'], [creditSym, '*']],
          },
        ],
        limit: 1000,
      });

      const agg = new Map<string, { stake: number; credits: number }>();
      const rowFor = (addr: string) => {
        let row = agg.get(addr);
        if (!row) {
          row = { stake: 0, credits: 0 };
          agg.set(addr, row);
        }
        return row;
      };

      for (const evt of response.events) {
        if (!evt.inSuccessfulContractCall) continue;
        const topics = (evt.topic as xdr.ScVal[]).map(scValToNative);
        const action = topics[0] as string;
        const address = String(topics[1] ?? '');
        if (!address) continue;

        const valueNative = scValToNative(evt.value as xdr.ScVal);
        const amount = this.extractEventAmount(valueNative);
        const row = rowFor(address);

        if (action === 'lock_assets') row.stake += amount / 10_000_000;
        else if (action === 'unlock_assets') row.stake = Math.max(0, row.stake - amount / 10_000_000);
        else if (action === 'update_credits') row.credits = amount;
      }

      const all: LeaderboardRow[] = Array.from(agg.entries())
        .map(([address, { stake, credits }]) => ({
          address,
          totalCredits: Math.round(credits),
          totalStake: Math.round(stake),
          boostUtilization: 0,
        }))
        .filter((e) => e.totalStake > 0 || e.totalCredits > 0);

      all.sort((a, b) =>
        sortKey === 'credits'
          ? b.totalCredits - a.totalCredits
          : b.totalStake - a.totalStake,
      );

      return { entries: all.slice(offset, offset + limit), total: all.length };
    } catch (err) {
      console.warn('[SmartDrop] event-derived leaderboard failed:', err);
      return { entries: [], total: 0 };
    }
  }

  private async getLeaderboardPoolIds(): Promise<string[]> {
    const ids = new Set<string>();
    const envPool = process.env.NEXT_PUBLIC_POOL_CONTRACT_ID;
    if (envPool) ids.add(envPool);
    try {
      const pools = await this.getFactoryPools();
      pools.forEach((p) => {
        if (p.contractAddress) ids.add(p.contractAddress);
      });
    } catch {
      // factory not configured; env pool is enough
    }
    return Array.from(ids);
  }

  private extractEventAmount(valueNative: unknown): number {
    if (typeof valueNative === 'bigint') return Number(valueNative);
    if (typeof valueNative === 'number') return valueNative;
    if (Array.isArray(valueNative)) return Number(valueNative[0] ?? 0);
    if (valueNative && typeof valueNative === 'object') {
      const v = valueNative as Record<string, unknown>;
      return Number(v['amount'] ?? v['credits'] ?? v['credits_earned'] ?? 0);
    }
    return Number(valueNative ?? 0);
  }

  // Helper methods for parsing XDR data
  private parsePoolsFromXdr(xdrResult: xdr.ScVal): PoolInfo[] {
    return parsePoolsFromXdrResult(xdrResult);
  }

  private parseUserPositionFromXdr(
    xdrResult: xdr.ScVal,
    poolId: string,
    userAddress: string,
  ): UserPosition | null {
    return parseUserPositionFromXdrResult(xdrResult, poolId, userAddress);
  }

  private parseCreditsFromXdr(xdrResult: xdr.ScVal): string {
    return parseCreditsFromXdrResult(xdrResult);
  }

  async getCreditVelocity(_windowHours: number = 24): Promise<string> {
    try {
      void _windowHours;
      const totalCreditsAccumulated = 0n;
      return totalCreditsAccumulated.toString();
    } catch (error) {
      console.error("Failed to calculate credit velocity:", error);
      return "0";
    }
  }
}

// Export singleton instance
export const sorobanService = new SorobanService();

// Initialize on import
sorobanService.initialize();

// Utility functions
export const formatCredits = (credits: string): string => {
  const normalizedCredits = credits.trim();
  if (!normalizedCredits || normalizedCredits === '-' || normalizedCredits === '—') {
    return credits;
  }

  const num = Number(normalizedCredits);
  if (!Number.isFinite(num)) {
    return '0';
  }

  const absoluteValue = Math.abs(num);
  if (absoluteValue >= 999950) {
    return `${(num / 1000000).toFixed(1)}M`;
  }
  if (absoluteValue >= 999.95) {
    return `${(num / 1000).toFixed(1)}K`;
  }
  if (num === 0) {
    return '0';
  }

  const fractionDigits = absoluteValue < 1 ? 7 : absoluteValue < 100 ? 4 : 2;
  const formattedCredits = num.toFixed(fractionDigits).replace(/\.?0+$/, '');

  return Number(formattedCredits) === 0 ? normalizedCredits : formattedCredits;
};

export const formatLockTime = (timestamp: number): string => {
  const now = Date.now();
  const diff = timestamp - now;
  
  if (diff <= 0) {
    return 'Unlockable now';
  }
  
  const hours = Math.floor(diff / (1000 * 60 * 60));
  const days = Math.floor(hours / 24);
  
  if (days > 0) {
    return `${days} day${days > 1 ? 's' : ''} remaining`;
  } else if (hours > 0) {
    return `${hours} hour${hours > 1 ? 's' : ''} remaining`;
  } else {
    return 'Less than 1 hour';
  }
};

export const formatAssetAmount = (amount: string, asset: AssetInfo): string => {
  const num = parseFloat(amount);
  return `${num.toLocaleString()} ${asset.code}`;
};

/** Convenience wrapper — call lock_assets on a pool and await on-chain confirmation. */
export const lockAssets = async ({
  poolContractId,
  publicKey,
  amount,
  walletApi,
  onHash,
  onStep,
}: {
  poolContractId: string;
  publicKey: string;
  amount: string;
  walletApi: FreighterWalletApi;
} & LockAssetsCallbacks) =>
  sorobanService.lockAssets(poolContractId, publicKey, amount, walletApi, {
    onHash,
    onStep,
  });

export const unlockAssets = async ({
  poolContractId,
  publicKey,
  amount,
  walletApi,
  onHash,
  onStep,
}: {
  poolContractId: string;
  publicKey: string;
  amount: string;
  walletApi: FreighterWalletApi;
} & UnlockAssetsCallbacks) => {
  // Convert display-unit amount to integer stroops before passing as i128.
  // 1 display unit = 10,000,000 stroops (Stellar's fixed-point precision).
  const stroops = Math.round(parseFloat(amount) * 10_000_000).toString();
  return sorobanService.unlockAssets(poolContractId, publicKey, stroops, walletApi, {
    onHash,
    onStep,
  });
};

export const stellarExpertTxUrl = (hash: string, network: string) =>
  `https://stellar.expert/explorer/${network}/tx/${hash}`;

/**
 * Compute live-preview values for a partial unlock.
 * All arguments and return values are in display units (not stroops).
 */
export function computePartialUnlockPreview(
  lockedAmount: number,
  unlockAmount: number,
  dailyRate: number,
): { remainingStake: number; newDailyRate: number } {
  const remainingStake = lockedAmount - unlockAmount;
  const newDailyRate =
    lockedAmount > 0 ? (remainingStake / lockedAmount) * dailyRate : 0;
  return { remainingStake, newDailyRate };
}

// ── Transaction history ───────────────────────────────────────────────────────

export interface TxHistoryEntry {
  date: string;
  action: 'lock' | 'unlock';
  amount: string;
  symbol: string;
  poolId: string;
  creditsEarned?: string;
  txHash: string;
}

// Ledger lookback window: ~7 days at ~5 s per ledger.
const HISTORY_LOOKBACK_LEDGERS = 120960;

interface SorobanRpcServer {
  getLatestLedger(): Promise<{ sequence: number }>;
  getEvents(request: Parameters<rpc.Server['getEvents']>[0]): ReturnType<rpc.Server['getEvents']>;
}

type SorobanEventLike = {
  inSuccessfulContractCall?: boolean;
  topic: xdr.ScVal[];
  value: xdr.ScVal;
  ledgerClosedAt: string;
  contractId?: string | Contract;
  txHash: string;
};

function parseTxHistoryEvent(
  evt: SorobanEventLike,
  publicKey: string,
): TxHistoryEntry | null {
  try {
    if (!evt.inSuccessfulContractCall) return null;

    const topicNatives = (evt.topic as xdr.ScVal[]).map(scValToNative);
    const actionRaw = topicNatives[0] as string;
    if (actionRaw !== 'lock_assets' && actionRaw !== 'unlock_assets') return null;

    // topic[1] is the user's address — only include events for this wallet
    const userAddr = topicNatives[1] as string;
    if (userAddr !== publicKey) return null;

    const action: 'lock' | 'unlock' = actionRaw === 'lock_assets' ? 'lock' : 'unlock';
    const poolId =
      typeof evt.contractId === 'string'
        ? evt.contractId
        : evt.contractId?.contractId();
    if (!poolId) return null;

    const valueNative = scValToNative(evt.value as xdr.ScVal);
    let amount = '0';
    let symbol = 'XLM';
    let creditsEarned: string | undefined;

    if (Array.isArray(valueNative)) {
      amount = String(valueNative[0] ?? '0');
      symbol = String(valueNative[1] ?? 'XLM');
      if (action === 'unlock' && valueNative[2] != null) {
        creditsEarned = String(valueNative[2]);
      }
    } else if (valueNative && typeof valueNative === 'object') {
      const v = valueNative as Record<string, unknown>;
      amount = String(v['amount'] ?? '0');
      symbol = String(v['symbol'] ?? 'XLM');
      if (action === 'unlock' && v['credits_earned'] != null) {
        creditsEarned = String(v['credits_earned']);
      }
    }

    return {
      date: evt.ledgerClosedAt as string,
      action,
      amount,
      symbol,
      poolId,
      creditsEarned,
      txHash: evt.txHash as string,
    };
  } catch {
    return null;
  }
}

/**
 * Fetch a user's lock/unlock history by scanning Soroban contract events
 * emitted by the given pool contracts over the past ~7 days.
 *
 * Pass `rpcOverride` in tests to inject a mock RPC server.
 */
export async function getUserTransactionHistory(
  publicKey: string,
  poolContractIds: string[],
  rpcOverride?: SorobanRpcServer,
): Promise<TxHistoryEntry[]> {
  if (!publicKey || poolContractIds.length === 0) return [];

  const server: SorobanRpcServer = rpcOverride ?? rpcServer;

  try {
    const latest = await server.getLatestLedger();
    const startLedger = Math.max(1, latest.sequence - HISTORY_LOOKBACK_LEDGERS);

    const lockSymbol = xdr.ScVal.scvSymbol('lock_assets').toXDR('base64');
    const unlockSymbol = xdr.ScVal.scvSymbol('unlock_assets').toXDR('base64');

    const response = await server.getEvents({
      startLedger,
      filters: [
        {
          type: 'contract',
          contractIds: poolContractIds,
          topics: [
            [lockSymbol, '*'],
            [unlockSymbol, '*'],
          ],
        },
      ],
      limit: 200,
    });

    const entries: TxHistoryEntry[] = [];
    for (const evt of response.events) {
      const entry = parseTxHistoryEvent(evt as SorobanEventLike, publicKey);
      if (entry) entries.push(entry);
    }

    // Newest first
    return entries.sort(
      (a, b) => new Date(b.date).getTime() - new Date(a.date).getTime(),
    );
  } catch (error) {
    console.error('Error fetching transaction history:', error);
    return [];
  }
}

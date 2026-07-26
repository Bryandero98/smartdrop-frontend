import { afterEach, describe, expect, it, vi } from "vitest";

const { assembleTransactionMock } = vi.hoisted(() => ({
  assembleTransactionMock: vi.fn(),
}));

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@stellar/stellar-sdk")>();

  return {
    ...actual,
    rpc: {
      ...actual.rpc,
      assembleTransaction: assembleTransactionMock,
    },
  };
});

import {
  Account,
  Address,
  Contract,
  type FeeBumpTransaction,
  Networks,
  StrKey,
  type Transaction,
  TransactionBuilder,
  nativeToScVal,
  scValToNative,
  xdr,
} from "@stellar/stellar-sdk";
import {
  SorobanService,
  amountToStroops,
  buildFeeBumpTransaction,
  computePartialUnlockPreview,
  formatAssetAmount,
  formatCredits,
  formatLockTime,
  getContractErrorMessage,
  getStellarBalance,
  getUserTransactionHistory,
  lockAssets as lockAssetsWrapper,
  parseCreditsFromXdrResult,
  parsePoolsFromXdrResult,
  parseUserPositionFromXdrResult,
  sorobanService,
  stellarExpertTxUrl,
  unlockAssets,
  validateSimulationAuth,
} from "./soroban";

const POOL_CONTRACT_ID =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const USER_PUBLIC_KEY = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const POOL_ID = "pool-xlm";

type MockRpcServer = {
  getAccount: ReturnType<typeof vi.fn>;
  simulateTransaction: ReturnType<typeof vi.fn>;
  sendTransaction: ReturnType<typeof vi.fn>;
  getTransaction: ReturnType<typeof vi.fn>;
  getLatestLedger: ReturnType<typeof vi.fn>;
  getEvents: ReturnType<typeof vi.fn>;
};

function makePoolNative(overrides: Record<string, unknown> = {}) {
  return {
    id: "pool-xlm",
    contract_address: POOL_CONTRACT_ID,
    asset_code: "XLM",
    is_native: true,
    daily_rate: BigInt(5_000_000),
    min_lock_period: BigInt(86_400),
    total_locked: BigInt(100_000_000),
    total_users: BigInt(3),
    is_active: true,
    created_at: BigInt(1_700_000_000),
    ...overrides,
  };
}

function makeContractEvent({
  action,
  address = USER_PUBLIC_KEY,
  value,
  ledgerClosedAt = "2026-06-29T12:00:00.000Z",
  inSuccessfulContractCall = true,
  contractId = POOL_CONTRACT_ID,
  txHash = `${action}-tx`,
}: {
  action: string;
  address?: string;
  value: unknown;
  ledgerClosedAt?: string;
  inSuccessfulContractCall?: boolean;
  contractId?: string;
  txHash?: string;
}) {
  return {
    inSuccessfulContractCall,
    topic: [xdr.ScVal.scvSymbol(action), nativeToScVal(address)],
    value: nativeToScVal(value),
    ledgerClosedAt,
    contractId,
    txHash,
  };
}

function invokeContractFromOperation(op: xdr.Operation) {
  return op.body().invokeHostFunctionOp().hostFunction().invokeContract();
}

function makeAuthEntry(functionName: string, contractId = POOL_CONTRACT_ID) {
  const contractFn = new xdr.InvokeContractArgs({
    contractAddress: Address.fromString(contractId).toScAddress(),
    functionName,
    args: [],
  });

  return new xdr.SorobanAuthorizationEntry({
    credentials: xdr.SorobanCredentials.sorobanCredentialsSourceAccount(),
    rootInvocation: new xdr.SorobanAuthorizedInvocation({
      function:
        xdr.SorobanAuthorizedFunction.sorobanAuthorizedFunctionTypeContractFn(
          contractFn,
        ),
      subInvocations: [],
    }),
  });
}

function makeMockRpcServer(
  overrides: Partial<MockRpcServer> = {},
): MockRpcServer {
  return {
    getAccount: vi.fn().mockResolvedValue(new Account(USER_PUBLIC_KEY, "0")),
    simulateTransaction: vi.fn(),
    sendTransaction: vi.fn(),
    getTransaction: vi.fn().mockResolvedValue({ status: "SUCCESS" }),
    getLatestLedger: vi.fn().mockResolvedValue({ sequence: 200_000 }),
    getEvents: vi.fn().mockResolvedValue({ events: [] }),
    ...overrides,
  };
}

function makeService({
  factory = false,
  pool = true,
  rpcServer = makeMockRpcServer(),
}: {
  factory?: boolean;
  pool?: boolean;
  rpcServer?: MockRpcServer;
} = {}) {
  const service = new SorobanService();
  const svc = service as unknown as {
    factoryContract?: Contract;
    poolContracts: Map<string, Contract>;
    rpcServer: MockRpcServer;
  };

  svc.rpcServer = rpcServer;
  if (factory) svc.factoryContract = new Contract(POOL_CONTRACT_ID);
  else svc.factoryContract = undefined;
  if (pool) svc.poolContracts.set(POOL_ID, new Contract(POOL_CONTRACT_ID));

  return { service, rpcServer };
}

function mockAssembleTransactionPassthrough() {
  assembleTransactionMock.mockImplementation(
    (transaction: Transaction | FeeBumpTransaction) => ({
      build: () => transaction,
    }),
  );
  return assembleTransactionMock;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  assembleTransactionMock.mockReset();
});

describe("soroban formatters", () => {
  it("formats credits below 1000, thousands, and millions", () => {
    expect(formatCredits("999.4")).toBe("999");
    expect(formatCredits("1500")).toBe("1.5K");
    expect(formatCredits("2500000")).toBe("2.5M");
  });

  it("formats lock time with fake timers for past, day, hour, and sub-hour cases", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-27T12:00:00.000Z"));

    const now = Date.now();

    expect(formatLockTime(now - 1)).toBe("Unlockable now");
    expect(formatLockTime(now + 2 * 24 * 60 * 60 * 1000)).toBe(
      "2 days remaining",
    );
    expect(formatLockTime(now + 3 * 60 * 60 * 1000)).toBe("3 hours remaining");
    expect(formatLockTime(now + 30 * 60 * 1000)).toBe("Less than 1 hour");
  });

  it("formats native and issued asset amounts with the asset code suffix", () => {
    expect(formatAssetAmount("12.5", { code: "XLM", isNative: true })).toBe(
      "12.5 XLM",
    );

    const issued = formatAssetAmount("1234.5", {
      code: "USDC",
      issuer: USER_PUBLIC_KEY,
      isNative: false,
    });

    expect(issued).toMatch(/^(1,234\.5|1234\.5) USDC$/);
  });
});

describe("soroban amount and Horizon helpers", () => {
  it("amountToStroops trims and pads decimal amounts", () => {
    expect(amountToStroops(" 12.345 ")).toBe(123_450_000n);
    expect(amountToStroops("1.2", 2)).toBe(120n);
    expect(amountToStroops("5", 0)).toBe(5n);
  });

  it("amountToStroops rejects invalid decimal precision and amounts", () => {
    expect(() => amountToStroops("1", -1)).toThrow(
      "Decimal precision must be a non-negative integer.",
    );
    expect(() => amountToStroops("abc")).toThrow(
      "Enter a valid positive decimal amount.",
    );
    expect(() => amountToStroops("1.234", 2)).toThrow(
      "Amount supports at most 2 decimal places.",
    );
    expect(() => amountToStroops("0")).toThrow(
      "Amount must be greater than 0.",
    );
  });

  it("getStellarBalance returns the native balance from a realistic Horizon response", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        balances: [
          {
            asset_type: "credit_alphanum4",
            asset_code: "USDC",
            balance: "50.0000000",
          },
          { asset_type: "native", balance: "123.4567890" },
        ],
      }),
    } as Response);

    await expect(getStellarBalance(USER_PUBLIC_KEY)).resolves.toBe(123.456789);

    expect(fetchSpy).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`/accounts/${USER_PUBLIC_KEY}$`)),
    );
  });

  it("getStellarBalance throws for Horizon non-OK and missing native balances", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce({
      ok: false,
      status: 404,
    } as Response);

    await expect(getStellarBalance(USER_PUBLIC_KEY)).rejects.toThrow(
      "Unable to fetch Stellar balance from Horizon (404).",
    );

    fetchSpy.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        balances: [{ asset_type: "credit_alphanum4", balance: "1" }],
      }),
    } as Response);

    await expect(getStellarBalance(USER_PUBLIC_KEY)).rejects.toThrow(
      "Horizon account response did not include a native XLM balance.",
    );
  });

  it("getContractErrorMessage normalizes decimal and hex contract error codes", () => {
    expect(getContractErrorMessage("1")).toBe("Assets are still locked");
    expect(getContractErrorMessage("contract code: 1")).toBe(
      "Assets are still locked",
    );
    expect(getContractErrorMessage("0x01")).toBe("Assets are still locked");
    expect(getContractErrorMessage("99")).toBeUndefined();
  });
});

describe("soroban XDR wrappers", () => {
  it("parses a valid ScVec of pool maps into PoolInfo entries", () => {
    const scVal = nativeToScVal([makePoolNative()]);

    const pools = parsePoolsFromXdrResult(scVal);

    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({
      id: "pool-xlm",
      contractAddress: POOL_CONTRACT_ID,
      asset: { code: "XLM", isNative: true },
      dailyRate: "0.5000000",
      minLockPeriod: 86_400,
      totalLocked: "10.0000000",
      totalUsers: 3,
      isActive: true,
      createdAt: 1_700_000_000,
    });
  });

  it("returns an empty array for an empty ScVec", () => {
    expect(parsePoolsFromXdrResult(nativeToScVal([]))).toEqual([]);
  });

  it("returns empty pools and warns when the XDR result is not a Vec", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    expect(parsePoolsFromXdrResult(nativeToScVal({ id: "not-a-vec" }))).toEqual(
      [],
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[SmartDrop] parsePoolsFromXdr: expected Vec (array), got",
      "object",
    );
  });

  it("skips malformed entries and warns while keeping valid pools", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const scVal = nativeToScVal([
      makePoolNative({ id: "valid-1" }),
      "malformed-entry",
      makePoolNative({ id: "valid-2" }),
    ]);

    const pools = parsePoolsFromXdrResult(scVal);

    expect(pools.map((pool) => pool.id)).toEqual(["valid-1", "valid-2"]);
    expect(warnSpy).toHaveBeenCalledWith(
      "[SmartDrop] parsePoolsFromXdr: skipping malformed pool at index 1:",
      expect.any(TypeError),
    );
  });

  it("parses i128 credit stroops into display units", () => {
    const credits = nativeToScVal(BigInt(25_000_000), { type: "i128" });

    expect(parseCreditsFromXdrResult(credits)).toBe("2.5000000");
  });

  it("returns null for empty and non-map user position XDR results", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    expect(
      parseUserPositionFromXdrResult(
        xdr.ScVal.scvVoid(),
        POOL_ID,
        USER_PUBLIC_KEY,
      ),
    ).toBeNull();
    expect(
      parseUserPositionFromXdrResult(
        nativeToScVal("not-a-map"),
        POOL_ID,
        USER_PUBLIC_KEY,
      ),
    ).toBeNull();
    expect(warnSpy).toHaveBeenCalledWith(
      "[SmartDrop] parseUserPositionFromXdr: expected Map (object), got",
      "string",
    );
  });

  it("returns zero credits when credit XDR parsing fails", () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);

    expect(parseCreditsFromXdrResult(undefined as unknown as xdr.ScVal)).toBe(
      "0",
    );
    expect(warnSpy).toHaveBeenCalledWith(
      "[SmartDrop] parseCreditsFromXdr: failed to parse:",
      expect.any(Error),
    );
  });
});

describe("soroban transaction builders", () => {
  it("builds fee-bump transactions from transaction objects and XDR strings", () => {
    const sponsorPublicKey = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 9));
    const account = new Account(USER_PUBLIC_KEY, "0");
    const innerTransaction = new TransactionBuilder(account, {
      fee: "321",
      networkPassphrase: Networks.TESTNET,
    })
      .addOperation(new Contract(POOL_CONTRACT_ID).call("noop"))
      .setTimeout(30)
      .build();

    const objectFeeBump = buildFeeBumpTransaction(
      innerTransaction,
      sponsorPublicKey,
      Networks.TESTNET,
    );
    const xdrFeeBump = buildFeeBumpTransaction(
      innerTransaction.toXDR(),
      sponsorPublicKey,
      Networks.TESTNET,
    );

    expect(objectFeeBump.feeSource).toBe(sponsorPublicKey);
    expect(objectFeeBump.fee).toBe("642");
    expect(objectFeeBump.innerTransaction.operations).toHaveLength(1);
    expect(xdrFeeBump.feeSource).toBe(sponsorPublicKey);
    expect(xdrFeeBump.innerTransaction.source).toBe(USER_PUBLIC_KEY);
    expect(xdrFeeBump.innerTransaction.operations).toHaveLength(1);
  });

  it("builds lock_assets with the user ScAddress and amount as i128", async () => {
    const { service, rpcServer } = makeService();
    rpcServer.simulateTransaction.mockResolvedValue({
      error: "stop before signing",
    });
    const callSpy = vi.spyOn(Contract.prototype, "call");

    const result = await service.lockAssets(
      POOL_ID,
      USER_PUBLIC_KEY,
      "123456789",
      {
        signTransaction: vi.fn(),
      },
    );

    expect(result).toEqual({
      success: false,
      status: "FAILED",
      error: "Simulation failed: stop before signing",
    });
    expect(callSpy).toHaveBeenCalledWith(
      "lock_assets",
      expect.any(xdr.ScVal),
      expect.any(xdr.ScVal),
    );

    const op = callSpy.mock.results[0].value as xdr.Operation;
    const invokeContract = invokeContractFromOperation(op);
    const [addressArg, amountArg] = invokeContract.args();

    expect(invokeContract.functionName().toString()).toBe("lock_assets");
    expect(addressArg.switch()).toBe(xdr.ScValType.scvAddress());
    expect(addressArg.address().switch()).toBe(
      xdr.ScAddressType.scAddressTypeAccount(),
    );
    expect(scValToNative(addressArg)).toBe(USER_PUBLIC_KEY);
    expect(amountArg.switch()).toBe(xdr.ScValType.scvI128());
    expect(scValToNative(amountArg)).toBe(
      BigInt(123_456_789) * BigInt(10_000_000),
    );
  });

  it("converts unlock display units to stroops before delegating", async () => {
    const walletApi = { signTransaction: vi.fn() };
    const unlockSpy = vi
      .spyOn(sorobanService, "unlockAssets")
      .mockResolvedValue({ success: true, transactionHash: "abc123" });

    await expect(
      unlockAssets({
        poolContractId: "pool-xlm",
        publicKey: USER_PUBLIC_KEY,
        amount: "1.2345678",
        walletApi,
      }),
    ).resolves.toEqual({ success: true, transactionHash: "abc123" });

    expect(unlockSpy).toHaveBeenCalledWith(
      "pool-xlm",
      USER_PUBLIC_KEY,
      "12345678",
      walletApi,
      { onHash: undefined, onStep: undefined },
    );
  });

  it("delegates lockAssets wrapper callbacks to the singleton service", async () => {
    const walletApi = { signTransaction: vi.fn() };
    const onHash = vi.fn();
    const onStep = vi.fn();
    const lockSpy = vi
      .spyOn(sorobanService, "lockAssets")
      .mockResolvedValue({
        success: true,
        transactionHash: "lock-wrapper-hash",
      });

    await expect(
      lockAssetsWrapper({
        poolContractId: "pool-xlm",
        publicKey: USER_PUBLIC_KEY,
        amount: "1.5000000",
        walletApi,
        onHash,
        onStep,
      }),
    ).resolves.toEqual({ success: true, transactionHash: "lock-wrapper-hash" });

    expect(lockSpy).toHaveBeenCalledWith(
      "pool-xlm",
      USER_PUBLIC_KEY,
      "1.5000000",
      walletApi,
      { onHash, onStep },
    );
  });
});

describe("soroban authorization validation", () => {
  it("rejects missing, mismatched, and unexpected simulation auth entries", () => {
    expect(() =>
      validateSimulationAuth({ result: { auth: null } }, []),
    ).toThrow(
      "Transaction signing was blocked because the simulation did not return authorization entries.",
    );
    expect(() =>
      validateSimulationAuth({ result: { auth: [] } }, [
        { contractId: POOL_CONTRACT_ID, functionName: "lock_assets" },
      ]),
    ).toThrow(
      "Transaction signing was blocked because the simulation returned 0 authorization entries, but SmartDrop expected 1.",
    );
    expect(() =>
      validateSimulationAuth(
        { result: { auth: [makeAuthEntry("set_boost")] } },
        [{ contractId: POOL_CONTRACT_ID, functionName: "lock_assets" }],
      ),
    ).toThrow(
      `Transaction signing was blocked because the simulated authorization targets ${POOL_CONTRACT_ID}.set_boost, which is not expected for this SmartDrop action.`,
    );
  });
});

describe("SorobanService RPC reads", () => {
  it("getFactoryPools returns parsed pools from a simulated factory call", async () => {
    const { service, rpcServer } = makeService({ factory: true, pool: false });
    rpcServer.simulateTransaction.mockResolvedValue({
      result: {
        retval: nativeToScVal([makePoolNative({ id: "factory-pool" })]),
      },
    });

    const pools = await service.getFactoryPools();

    expect(pools).toHaveLength(1);
    expect(pools[0]).toMatchObject({
      id: "factory-pool",
      contractAddress: POOL_CONTRACT_ID,
      totalLocked: "10.0000000",
    });
    expect(rpcServer.getAccount).toHaveBeenCalledWith(
      "GBQ3WPTHKJ5XKWLOKUZJLZL2GVXR6RWQCXUVDQZWM7Q2YNLDRVGM5ZWJ",
    );
    expect(rpcServer.simulateTransaction).toHaveBeenCalledTimes(1);
  });

  it("getFactoryPools returns an empty list when the factory is not initialized", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const { service, rpcServer } = makeService({ factory: false, pool: false });

    await expect(service.getFactoryPools()).resolves.toEqual([]);

    expect(warnSpy).toHaveBeenCalledWith(
      "Factory contract not initialized; returning empty pool list",
    );
    expect(rpcServer.getAccount).not.toHaveBeenCalled();
  });

  it("getFactoryPools returns an empty list when simulation reports an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service, rpcServer } = makeService({ factory: true, pool: false });
    rpcServer.simulateTransaction.mockResolvedValue({
      error: "factory unavailable",
    });

    await expect(service.getFactoryPools()).resolves.toEqual([]);
  });

  it("getUserPosition returns a parsed user position from a simulated pool call", async () => {
    const { service, rpcServer } = makeService();
    rpcServer.simulateTransaction.mockResolvedValue({
      result: {
        retval: nativeToScVal({
          amount: BigInt(75_000_000),
          locked_at: BigInt(1_700_000_000),
          credits: BigInt(15_000_000),
          is_locked: true,
          unlockable_at: BigInt(1_700_086_400),
          boost_allocation: 25,
        }),
      },
    });

    const position = await service.getUserPosition(POOL_ID, USER_PUBLIC_KEY);

    expect(position).toMatchObject({
      user: USER_PUBLIC_KEY,
      poolId: POOL_ID,
      amount: "7.5000000",
      lockedAt: 1_700_000_000,
      credits: "1.5000000",
      isLocked: true,
      unlockableAt: 1_700_086_400,
      boostAllocation: 25,
    });
  });

  it("getUserPosition returns null when the pool is not registered", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const { service, rpcServer } = makeService({ pool: false });

    await expect(
      service.getUserPosition("missing-pool", USER_PUBLIC_KEY),
    ).resolves.toBeNull();

    expect(warnSpy).toHaveBeenCalledWith(
      "Pool contract not found for ID: missing-pool",
    );
    expect(rpcServer.getAccount).not.toHaveBeenCalled();
  });

  it("getUserPosition returns null when simulation reports an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service, rpcServer } = makeService();
    rpcServer.simulateTransaction.mockResolvedValue({
      error: "position failed",
    });

    await expect(
      service.getUserPosition(POOL_ID, USER_PUBLIC_KEY),
    ).resolves.toBeNull();
  });

  it("calculateUserCredits returns parsed credit display units", async () => {
    const { service, rpcServer } = makeService();
    rpcServer.simulateTransaction.mockResolvedValue({
      result: { retval: nativeToScVal(BigInt(12_345_678), { type: "i128" }) },
    });

    await expect(
      service.calculateUserCredits(POOL_ID, USER_PUBLIC_KEY),
    ).resolves.toBe("1.2345678");
  });

  it("calculateUserCredits returns zero when the pool is not registered", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const { service, rpcServer } = makeService({ pool: false });

    await expect(
      service.calculateUserCredits("missing-pool", USER_PUBLIC_KEY),
    ).resolves.toBe("0");

    expect(warnSpy).toHaveBeenCalledWith(
      "Pool contract not found for ID: missing-pool",
    );
    expect(rpcServer.getAccount).not.toHaveBeenCalled();
  });

  it("calculateUserCredits returns zero when simulation reports an error", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service, rpcServer } = makeService();
    rpcServer.simulateTransaction.mockResolvedValue({ error: "credit failed" });

    await expect(
      service.calculateUserCredits(POOL_ID, USER_PUBLIC_KEY),
    ).resolves.toBe("0");
  });
});

describe("SorobanService RPC writes", () => {
  it("lockAssets signs and submits an assembled transaction on success", async () => {
    const { service, rpcServer } = makeService();
    const assembleSpy = mockAssembleTransactionPassthrough();
    rpcServer.simulateTransaction.mockResolvedValue({
      result: { auth: [makeAuthEntry("lock_assets")] },
      minResourceFee: "321",
    });
    rpcServer.sendTransaction.mockResolvedValue({
      status: "PENDING",
      hash: "lock-hash",
    });
    const walletApi = {
      signTransaction: vi.fn(async (xdrEnvelope: string) => xdrEnvelope),
    };

    const result = await service.lockAssets(
      POOL_ID,
      USER_PUBLIC_KEY,
      "50000000",
      walletApi,
    );

    expect(result).toEqual({
      success: true,
      transactionHash: "lock-hash",
      hash: "lock-hash",
      status: "SUCCESS",
      resultXdr: undefined,
      gasUsed: "321",
    });
    expect(assembleSpy).toHaveBeenCalledWith(
      expect.any(Object),
      expect.objectContaining({ minResourceFee: "321" }),
    );
    expect(walletApi.signTransaction).toHaveBeenCalledWith(expect.any(String), {
      networkPassphrase: expect.any(String),
    });
    expect(rpcServer.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("lockAssets returns decoded contract error details when confirmation fails", async () => {
    const { service, rpcServer } = makeService();
    mockAssembleTransactionPassthrough();
    rpcServer.simulateTransaction.mockResolvedValue({
      result: { auth: [makeAuthEntry("lock_assets")] },
      minResourceFee: "321",
    });
    rpcServer.sendTransaction.mockResolvedValue({
      status: "PENDING",
      hash: "failed-lock-hash",
    });
    rpcServer.getTransaction.mockResolvedValue({
      status: "FAILED",
      errorResult: "Host function failed with contract code: 1",
    });
    const walletApi = {
      signTransaction: vi.fn(async (xdrEnvelope: string) => xdrEnvelope),
    };

    const result = await service.lockAssets(
      POOL_ID,
      USER_PUBLIC_KEY,
      "50000000",
      walletApi,
    );

    expect(result).toMatchObject({
      success: false,
      transactionHash: "failed-lock-hash",
      hash: "failed-lock-hash",
      status: "FAILED",
      errorCode: "1",
      error: "Assets are still locked",
    });
    expect(rpcServer.getTransaction).toHaveBeenCalledWith("failed-lock-hash");
  });

  it("unlockAssets signs and submits an assembled transaction on success", async () => {
    const { service, rpcServer } = makeService();
    mockAssembleTransactionPassthrough();
    rpcServer.simulateTransaction.mockResolvedValue({
      result: { auth: [makeAuthEntry("unlock_assets")] },
      minResourceFee: "654",
    });
    rpcServer.sendTransaction.mockResolvedValue({
      status: "PENDING",
      hash: "unlock-hash",
    });
    const walletApi = {
      signTransaction: vi.fn(async (xdrEnvelope: string) => xdrEnvelope),
    };

    const result = await service.unlockAssets(
      POOL_ID,
      USER_PUBLIC_KEY,
      "25000000",
      walletApi,
    );

    expect(result).toEqual({
      success: true,
      transactionHash: "unlock-hash",
      hash: "unlock-hash",
      status: "SUCCESS",
      resultXdr: undefined,
      gasUsed: "654",
    });
    expect(walletApi.signTransaction).toHaveBeenCalledTimes(1);
    expect(rpcServer.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("unlockAssets throws when the pool is not registered", async () => {
    const { service, rpcServer } = makeService({ pool: false });

    await expect(
      service.unlockAssets("missing-pool", USER_PUBLIC_KEY, "10000000", {
        signTransaction: vi.fn(),
      }),
    ).rejects.toThrow("Pool contract not found for ID: missing-pool");
    expect(rpcServer.getAccount).not.toHaveBeenCalled();
  });

  it("setBoost signs and submits an assembled transaction on success", async () => {
    const { service, rpcServer } = makeService();
    mockAssembleTransactionPassthrough();
    rpcServer.simulateTransaction.mockResolvedValue({
      result: { auth: [makeAuthEntry("set_boost")] },
      minResourceFee: "777",
    });
    rpcServer.sendTransaction.mockResolvedValue({
      status: "PENDING",
      hash: "boost-hash",
    });
    const walletApi = {
      signTransaction: vi.fn(async (xdrEnvelope: string) => xdrEnvelope),
    };

    const result = await service.setBoost(
      POOL_ID,
      USER_PUBLIC_KEY,
      40,
      walletApi,
    );

    expect(result).toEqual({
      success: true,
      transactionHash: "boost-hash",
      hash: "boost-hash",
      gasUsed: "777",
    });
    expect(walletApi.signTransaction).toHaveBeenCalledTimes(1);
    expect(rpcServer.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("setBoost rejects invalid allocation percentages before RPC calls", async () => {
    const { service, rpcServer } = makeService();

    await expect(
      service.setBoost(POOL_ID, USER_PUBLIC_KEY, 101, {
        signTransaction: vi.fn(),
      }),
    ).resolves.toEqual({
      success: false,
      error: "Allocation percentage must be between 0 and 100",
    });
    expect(rpcServer.getAccount).not.toHaveBeenCalled();
  });

  it("setBoost returns a failure result when simulation reports an error", async () => {
    const { service, rpcServer } = makeService();
    rpcServer.simulateTransaction.mockResolvedValue({
      error: "boost simulation failed",
    });

    await expect(
      service.setBoost(POOL_ID, USER_PUBLIC_KEY, 40, {
        signTransaction: vi.fn(),
      }),
    ).resolves.toEqual({
      success: false,
      error: "Simulation failed: boost simulation failed",
    });
    expect(rpcServer.sendTransaction).not.toHaveBeenCalled();
  });

  it("setBoost returns a failure result when signing fails", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { service, rpcServer } = makeService();
    mockAssembleTransactionPassthrough();
    rpcServer.simulateTransaction.mockResolvedValue({
      result: { auth: [makeAuthEntry("set_boost")] },
      minResourceFee: "777",
    });

    await expect(
      service.setBoost(POOL_ID, USER_PUBLIC_KEY, 40, {
        signTransaction: vi
          .fn()
          .mockRejectedValue(new Error("wallet rejected")),
      }),
    ).resolves.toEqual({
      success: false,
      error: "wallet rejected",
    });
    expect(errorSpy).toHaveBeenCalledWith(
      "Error setting boost:",
      expect.any(Error),
    );
    expect(rpcServer.sendTransaction).not.toHaveBeenCalled();
  });

  it("setBoost returns a failure result when submission returns ERROR", async () => {
    const { service, rpcServer } = makeService();
    mockAssembleTransactionPassthrough();
    rpcServer.simulateTransaction.mockResolvedValue({
      result: { auth: [makeAuthEntry("set_boost")] },
      minResourceFee: "777",
    });
    rpcServer.sendTransaction.mockResolvedValue({
      status: "ERROR",
      errorResult: "tx rejected",
    });
    const walletApi = {
      signTransaction: vi.fn(async (xdrEnvelope: string) => xdrEnvelope),
    };

    await expect(
      service.setBoost(POOL_ID, USER_PUBLIC_KEY, 40, walletApi),
    ).resolves.toEqual({
      success: false,
      error: "Transaction failed: tx rejected",
    });
    expect(rpcServer.sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("setBoost rethrows security validation failures", async () => {
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    const { service, rpcServer } = makeService();
    rpcServer.simulateTransaction.mockResolvedValue({
      result: { auth: [makeAuthEntry("lock_assets")] },
    });

    await expect(
      service.setBoost(POOL_ID, USER_PUBLIC_KEY, 40, {
        signTransaction: vi.fn(),
      }),
    ).rejects.toThrow("not expected for this SmartDrop action");
    expect(errorSpy).toHaveBeenCalledWith(
      "Error setting boost:",
      expect.any(Error),
    );
    expect(rpcServer.sendTransaction).not.toHaveBeenCalled();
  });
});

describe("SorobanService platform stats", () => {
  it("getPlatformStats aggregates pool totals from getFactoryPools", async () => {
    const { service } = makeService({ pool: false });
    vi.spyOn(service, "getFactoryPools").mockResolvedValue([
      {
        id: "pool-1",
        contractAddress: POOL_CONTRACT_ID,
        asset: { code: "XLM", isNative: true },
        dailyRate: "0.5000000",
        minLockPeriod: 86_400,
        totalLocked: "1000",
        totalUsers: 25,
        isActive: true,
        createdAt: 1,
      },
      {
        id: "pool-2",
        contractAddress: POOL_CONTRACT_ID,
        asset: { code: "USDC", issuer: USER_PUBLIC_KEY, isNative: false },
        dailyRate: "0.2500000",
        minLockPeriod: 43_200,
        totalLocked: "2500",
        totalUsers: 15,
        isActive: true,
        createdAt: 2,
      },
    ]);

    await expect(service.getPlatformStats()).resolves.toEqual({
      totalValueLocked: "$3,500",
      totalUsers: 40,
      onlineUsers: 4,
      totalPools: 2,
    });
  });

  it("getPlatformStats returns zero stats when getFactoryPools throws", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { service } = makeService({ pool: false });
    vi.spyOn(service, "getFactoryPools").mockRejectedValue(
      new Error("stats failed"),
    );

    await expect(service.getPlatformStats()).resolves.toEqual({
      totalValueLocked: "$0",
      totalUsers: 0,
      onlineUsers: 0,
      totalPools: 0,
    });
  });
});

describe("SorobanService event-derived pool data", () => {
  it("getPoolHistory derives daily TVL from successful lock and unlock events", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-29T12:00:00.000Z"));
    const { service, rpcServer } = makeService({ pool: false });
    rpcServer.getLatestLedger.mockResolvedValue({ sequence: 200_000 });
    rpcServer.getEvents.mockResolvedValue({
      events: [
        makeContractEvent({
          action: "lock_assets",
          value: [50_000_000n],
          ledgerClosedAt: "2026-06-28T10:00:00.000Z",
        }),
        makeContractEvent({
          action: "unlock_assets",
          value: { amount: 20_000_000n },
          ledgerClosedAt: "2026-06-29T10:00:00.000Z",
        }),
        makeContractEvent({
          action: "lock_assets",
          value: { amount: 99_000_000n },
          ledgerClosedAt: "2026-06-29T11:00:00.000Z",
          inSuccessfulContractCall: false,
        }),
      ],
    });

    await expect(service.getPoolHistory(POOL_CONTRACT_ID, 3)).resolves.toEqual([
      { date: "2026-06-27", tvl: "0" },
      { date: "2026-06-28", tvl: "5" },
      { date: "2026-06-29", tvl: "3" },
    ]);

    expect(rpcServer.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        startLedger: 148_160,
        filters: [
          expect.objectContaining({
            type: "contract",
            contractIds: [POOL_CONTRACT_ID],
          }),
        ],
        limit: 500,
      }),
    );
  });

  it("getPoolHistory returns an empty list when event RPC throws", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const { service, rpcServer } = makeService({ pool: false });
    rpcServer.getLatestLedger.mockRejectedValue(
      new Error("ledger unavailable"),
    );

    await expect(service.getPoolHistory(POOL_CONTRACT_ID)).resolves.toEqual([]);

    expect(warnSpy).toHaveBeenCalledWith(
      "[SmartDrop] getPoolHistory failed:",
      expect.any(Error),
    );
  });

  it("getPoolDepositors aggregates successful lock and unlock events by address", async () => {
    const otherUser = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 8));
    const { service, rpcServer } = makeService({ pool: false });
    rpcServer.getLatestLedger.mockResolvedValue({ sequence: 200_000 });
    rpcServer.getEvents.mockResolvedValue({
      events: [
        makeContractEvent({
          action: "lock_assets",
          address: USER_PUBLIC_KEY,
          value: { amount: 100_000_000n },
        }),
        makeContractEvent({
          action: "lock_assets",
          address: otherUser,
          value: [30_000_000n],
        }),
        makeContractEvent({
          action: "unlock_assets",
          address: USER_PUBLIC_KEY,
          value: { amount: 40_000_000n },
        }),
        makeContractEvent({
          action: "lock_assets",
          address: "",
          value: { amount: 999_000_000n },
        }),
        makeContractEvent({
          action: "lock_assets",
          address: otherUser,
          value: { amount: 999_000_000n },
          inSuccessfulContractCall: false,
        }),
      ],
    });

    await expect(
      service.getPoolDepositors(POOL_CONTRACT_ID, 2),
    ).resolves.toEqual([
      { address: USER_PUBLIC_KEY, amount: "6", credits: "—" },
      { address: otherUser, amount: "3", credits: "—" },
    ]);
    expect(rpcServer.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        startLedger: 79_040,
        filters: [
          expect.objectContaining({
            type: "contract",
            contractIds: [POOL_CONTRACT_ID],
          }),
        ],
        limit: 500,
      }),
    );
  });

  it("getPoolDepositors returns an empty list when event RPC throws", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const { service, rpcServer } = makeService({ pool: false });
    rpcServer.getEvents.mockRejectedValue(new Error("events unavailable"));

    await expect(service.getPoolDepositors(POOL_CONTRACT_ID)).resolves.toEqual(
      [],
    );

    expect(warnSpy).toHaveBeenCalledWith(
      "[SmartDrop] getPoolDepositors failed:",
      expect.any(Error),
    );
  });
});

describe("SorobanService leaderboard", () => {
  type LeaderboardInternals = {
    fetchLeaderboardFromEvents: (
      offset: number,
      limit: number,
      sortKey: "credits" | "stake",
    ) => Promise<unknown>;
    getLeaderboardPoolIds: () => Promise<string[]>;
    extractEventAmount: (valueNative: unknown) => number;
    rpcServer: MockRpcServer;
  };

  function internals(service: SorobanService) {
    return service as unknown as LeaderboardInternals;
  }

  it("getLeaderboardPoolIds combines env and factory pool contract IDs without duplicates", async () => {
    const previousPool = process.env.NEXT_PUBLIC_POOL_CONTRACT_ID;
    process.env.NEXT_PUBLIC_POOL_CONTRACT_ID = POOL_CONTRACT_ID;
    const secondPool = StrKey.encodeContract(Buffer.alloc(32, 9));
    const { service } = makeService({ pool: false });
    vi.spyOn(service, "getFactoryPools").mockResolvedValue([
      {
        id: "pool-1",
        contractAddress: POOL_CONTRACT_ID,
        asset: { code: "XLM", isNative: true },
        dailyRate: "0",
        minLockPeriod: 0,
        totalLocked: "0",
        totalUsers: 0,
        isActive: true,
        createdAt: 1,
      },
      {
        id: "pool-2",
        contractAddress: secondPool,
        asset: { code: "USDC", issuer: USER_PUBLIC_KEY, isNative: false },
        dailyRate: "0",
        minLockPeriod: 0,
        totalLocked: "0",
        totalUsers: 0,
        isActive: true,
        createdAt: 2,
      },
    ]);

    try {
      await expect(internals(service).getLeaderboardPoolIds()).resolves.toEqual(
        [POOL_CONTRACT_ID, secondPool],
      );
    } finally {
      if (previousPool === undefined)
        delete process.env.NEXT_PUBLIC_POOL_CONTRACT_ID;
      else process.env.NEXT_PUBLIC_POOL_CONTRACT_ID = previousPool;
    }
  });

  it("extractEventAmount handles bigint, number, array, object, and null values", () => {
    const { service } = makeService({ pool: false });
    const helper = internals(service).extractEventAmount.bind(
      internals(service),
    );

    expect(helper(12n)).toBe(12);
    expect(helper(34)).toBe(34);
    expect(helper([56n])).toBe(56);
    expect(helper({ amount: 78n })).toBe(78);
    expect(helper({ credits: 90 })).toBe(90);
    expect(helper({ credits_earned: 123 })).toBe(123);
    expect(helper(null)).toBe(0);
  });

  it("getLeaderboard derives rows from events and sorts by credits or stake", async () => {
    const otherUser = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 8));
    const { service, rpcServer } = makeService({ pool: false });
    vi.spyOn(service, "getFactoryPools").mockResolvedValue([
      {
        id: "factory-pool",
        contractAddress: POOL_CONTRACT_ID,
        asset: { code: "XLM", isNative: true },
        dailyRate: "0",
        minLockPeriod: 0,
        totalLocked: "0",
        totalUsers: 0,
        isActive: true,
        createdAt: 1,
      },
    ]);
    rpcServer.getLatestLedger.mockResolvedValue({ sequence: 200_000 });
    rpcServer.getEvents.mockResolvedValue({
      events: [
        makeContractEvent({
          action: "lock_assets",
          address: USER_PUBLIC_KEY,
          value: { amount: 300_000_000n },
        }),
        makeContractEvent({
          action: "update_credits",
          address: USER_PUBLIC_KEY,
          value: { credits: 120 },
        }),
        makeContractEvent({
          action: "lock_assets",
          address: otherUser,
          value: [800_000_000n],
        }),
        makeContractEvent({
          action: "unlock_assets",
          address: otherUser,
          value: 100_000_000,
        }),
        makeContractEvent({
          action: "update_credits",
          address: otherUser,
          value: 50,
        }),
        makeContractEvent({
          action: "lock_assets",
          address: "",
          value: { amount: 999_000_000n },
        }),
        makeContractEvent({
          action: "update_credits",
          address: otherUser,
          value: 999,
          inSuccessfulContractCall: false,
        }),
      ],
    });

    await expect(service.getLeaderboard(0, 10, "credits")).resolves.toEqual({
      entries: [
        {
          address: USER_PUBLIC_KEY,
          totalCredits: 120,
          totalStake: 30,
          boostUtilization: 0,
        },
        {
          address: otherUser,
          totalCredits: 50,
          totalStake: 70,
          boostUtilization: 0,
        },
      ],
      total: 2,
    });

    await expect(service.getLeaderboard(0, 1, "stake")).resolves.toEqual({
      entries: [
        {
          address: otherUser,
          totalCredits: 50,
          totalStake: 70,
          boostUtilization: 0,
        },
      ],
      total: 2,
    });
  });

  it("fetchLeaderboardFromEvents returns an empty page without pool IDs and on RPC errors", async () => {
    const warnSpy = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const { service, rpcServer } = makeService({ pool: false });
    vi.spyOn(service, "getFactoryPools").mockResolvedValueOnce([]);

    await expect(
      internals(service).fetchLeaderboardFromEvents(0, 10, "credits"),
    ).resolves.toEqual({
      entries: [],
      total: 0,
    });
    expect(rpcServer.getEvents).not.toHaveBeenCalled();

    vi.spyOn(service, "getFactoryPools").mockResolvedValueOnce([
      {
        id: "factory-pool",
        contractAddress: POOL_CONTRACT_ID,
        asset: { code: "XLM", isNative: true },
        dailyRate: "0",
        minLockPeriod: 0,
        totalLocked: "0",
        totalUsers: 0,
        isActive: true,
        createdAt: 1,
      },
    ]);
    rpcServer.getLatestLedger.mockRejectedValueOnce(
      new Error("ledger unavailable"),
    );

    await expect(
      internals(service).fetchLeaderboardFromEvents(0, 10, "credits"),
    ).resolves.toEqual({
      entries: [],
      total: 0,
    });
    expect(warnSpy).toHaveBeenCalledWith(
      "[SmartDrop] event-derived leaderboard failed:",
      expect.any(Error),
    );
  });

  it("getLeaderboard uses the configured API and normalizes sparse API rows", async () => {
    const previousApi = process.env.NEXT_PUBLIC_LEADERBOARD_API_URL;
    process.env.NEXT_PUBLIC_LEADERBOARD_API_URL =
      "https://leaderboard.example/rankings";
    vi.resetModules();
    const { SorobanService: ApiSorobanService } = await import("./soroban");
    const service = new ApiSorobanService();
    const fetchSpy = vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        entries: [
          { address: USER_PUBLIC_KEY, totalCredits: "42", totalStake: "7" },
          { boostUtilization: "15" },
        ],
        total: 9,
      }),
    } as Response);

    try {
      await expect(service.getLeaderboard(5, 2, "stake")).resolves.toEqual({
        entries: [
          {
            address: USER_PUBLIC_KEY,
            totalCredits: 42,
            totalStake: 7,
            boostUtilization: 0,
          },
          {
            address: "",
            totalCredits: 0,
            totalStake: 0,
            boostUtilization: 15,
          },
        ],
        total: 9,
      });
    } finally {
      if (previousApi === undefined)
        delete process.env.NEXT_PUBLIC_LEADERBOARD_API_URL;
      else process.env.NEXT_PUBLIC_LEADERBOARD_API_URL = previousApi;
      vi.resetModules();
    }

    expect(fetchSpy).toHaveBeenCalledWith(
      "https://leaderboard.example/rankings?offset=5&limit=2&sort=stake",
      { headers: { accept: "application/json" } },
    );
  });

  it("getLeaderboard falls back to event scanning when the API responds non-OK", async () => {
    const previousApi = process.env.NEXT_PUBLIC_LEADERBOARD_API_URL;
    process.env.NEXT_PUBLIC_LEADERBOARD_API_URL =
      "https://leaderboard.example/rankings";
    vi.resetModules();
    const { SorobanService: ApiSorobanService } = await import("./soroban");
    const service = new ApiSorobanService();
    const rpcServer = makeMockRpcServer({
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 200_000 }),
      getEvents: vi.fn().mockResolvedValue({
        events: [
          makeContractEvent({
            action: "lock_assets",
            address: USER_PUBLIC_KEY,
            value: { amount: 250_000_000n },
          }),
        ],
      }),
    });
    internals(service as SorobanService).rpcServer = rpcServer;
    vi.spyOn(service, "getFactoryPools").mockResolvedValue([
      {
        id: "factory-pool",
        contractAddress: POOL_CONTRACT_ID,
        asset: { code: "XLM", isNative: true },
        dailyRate: "0",
        minLockPeriod: 0,
        totalLocked: "0",
        totalUsers: 0,
        isActive: true,
        createdAt: 1,
      },
    ]);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(globalThis, "fetch").mockResolvedValue({
      ok: false,
      status: 503,
    } as Response);

    try {
      await expect(service.getLeaderboard(0, 10, "credits")).resolves.toEqual({
        entries: [
          {
            address: USER_PUBLIC_KEY,
            totalCredits: 0,
            totalStake: 25,
            boostUtilization: 0,
          },
        ],
        total: 1,
      });
    } finally {
      if (previousApi === undefined)
        delete process.env.NEXT_PUBLIC_LEADERBOARD_API_URL;
      else process.env.NEXT_PUBLIC_LEADERBOARD_API_URL = previousApi;
      vi.resetModules();
    }
  });

  it("getCreditVelocity currently returns the zero accumulator", async () => {
    const { service } = makeService({ pool: false });

    await expect(service.getCreditVelocity(12)).resolves.toBe("0");
  });
});

describe("soroban exported utilities and transaction history", () => {
  it("builds Stellar Expert transaction URLs and partial unlock previews", () => {
    expect(stellarExpertTxUrl("abc123", "testnet")).toBe(
      "https://stellar.expert/explorer/testnet/tx/abc123",
    );
    expect(computePartialUnlockPreview(100, 25, 8)).toEqual({
      remainingStake: 75,
      newDailyRate: 6,
    });
    expect(computePartialUnlockPreview(0, 0, 8)).toEqual({
      remainingStake: 0,
      newDailyRate: 0,
    });
  });

  it("getUserTransactionHistory parses, filters, and sorts lock and unlock events", async () => {
    const otherUser = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 8));
    const rpcOverride = {
      getLatestLedger: vi.fn().mockResolvedValue({ sequence: 200_000 }),
      getEvents: vi.fn().mockResolvedValue({
        events: [
          makeContractEvent({
            action: "lock_assets",
            address: USER_PUBLIC_KEY,
            value: [100_000_000n, "XLM"],
            ledgerClosedAt: "2026-06-28T10:00:00.000Z",
            contractId: POOL_CONTRACT_ID,
            txHash: "lock-tx",
          }),
          makeContractEvent({
            action: "unlock_assets",
            address: USER_PUBLIC_KEY,
            value: {
              amount: 25_000_000n,
              symbol: "XLM",
              credits_earned: 7_500_000n,
            },
            ledgerClosedAt: "2026-06-29T10:00:00.000Z",
            contractId: POOL_CONTRACT_ID,
            txHash: "unlock-tx",
          }),
          makeContractEvent({
            action: "unlock_assets",
            address: USER_PUBLIC_KEY,
            value: [10_000_000n, "XLM", 1_500_000n],
            ledgerClosedAt: "2026-06-27T10:00:00.000Z",
            contractId: POOL_CONTRACT_ID,
            txHash: "unlock-array-tx",
          }),
          makeContractEvent({
            action: "lock_assets",
            address: otherUser,
            value: [999_000_000n, "XLM"],
            ledgerClosedAt: "2026-06-29T11:00:00.000Z",
            txHash: "other-user-tx",
          }),
          makeContractEvent({
            action: "update_credits",
            address: USER_PUBLIC_KEY,
            value: { credits: 100 },
            ledgerClosedAt: "2026-06-29T12:00:00.000Z",
            txHash: "ignored-action-tx",
          }),
          makeContractEvent({
            action: "lock_assets",
            address: USER_PUBLIC_KEY,
            value: [999_000_000n, "XLM"],
            ledgerClosedAt: "2026-06-29T13:00:00.000Z",
            inSuccessfulContractCall: false,
            txHash: "failed-tx",
          }),
          {
            inSuccessfulContractCall: true,
            topic: [
              xdr.ScVal.scvSymbol("lock_assets"),
              nativeToScVal(USER_PUBLIC_KEY),
            ],
            value: nativeToScVal([1_000_000n, "XLM"]),
            ledgerClosedAt: "2026-06-29T14:00:00.000Z",
            txHash: "missing-pool-tx",
          },
          {
            inSuccessfulContractCall: true,
            topic: undefined,
            value: nativeToScVal([1_000_000n, "XLM"]),
            ledgerClosedAt: "2026-06-29T15:00:00.000Z",
            contractId: POOL_CONTRACT_ID,
            txHash: "malformed-tx",
          },
        ],
      }),
    };

    await expect(
      getUserTransactionHistory(
        USER_PUBLIC_KEY,
        [POOL_CONTRACT_ID],
        rpcOverride,
      ),
    ).resolves.toEqual([
      {
        date: "2026-06-29T10:00:00.000Z",
        action: "unlock",
        amount: "25000000",
        symbol: "XLM",
        poolId: POOL_CONTRACT_ID,
        creditsEarned: "7500000",
        txHash: "unlock-tx",
      },
      {
        date: "2026-06-28T10:00:00.000Z",
        action: "lock",
        amount: "100000000",
        symbol: "XLM",
        poolId: POOL_CONTRACT_ID,
        creditsEarned: undefined,
        txHash: "lock-tx",
      },
      {
        date: "2026-06-27T10:00:00.000Z",
        action: "unlock",
        amount: "10000000",
        symbol: "XLM",
        poolId: POOL_CONTRACT_ID,
        creditsEarned: "1500000",
        txHash: "unlock-array-tx",
      },
    ]);
    expect(rpcOverride.getEvents).toHaveBeenCalledWith(
      expect.objectContaining({
        startLedger: 79_040,
        filters: [
          expect.objectContaining({
            type: "contract",
            contractIds: [POOL_CONTRACT_ID],
          }),
        ],
        limit: 200,
      }),
    );
  });

  it("getUserTransactionHistory handles empty guards and RPC failures", async () => {
    const rpcOverride = {
      getLatestLedger: vi
        .fn()
        .mockRejectedValue(new Error("ledger unavailable")),
      getEvents: vi.fn(),
    };
    const errorSpy = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);

    await expect(
      getUserTransactionHistory("", [POOL_CONTRACT_ID], rpcOverride),
    ).resolves.toEqual([]);
    await expect(
      getUserTransactionHistory(USER_PUBLIC_KEY, [], rpcOverride),
    ).resolves.toEqual([]);
    expect(rpcOverride.getLatestLedger).not.toHaveBeenCalled();

    await expect(
      getUserTransactionHistory(
        USER_PUBLIC_KEY,
        [POOL_CONTRACT_ID],
        rpcOverride,
      ),
    ).resolves.toEqual([]);
    expect(errorSpy).toHaveBeenCalledWith(
      "Error fetching transaction history:",
      expect.any(Error),
    );
  });
});

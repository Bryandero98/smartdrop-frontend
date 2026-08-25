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

vi.mock("@/config", () => ({
  networkPassphrase: "Test SDF Network ; September 2015",
  rpcServer: { simulateTransaction: vi.fn() },
  sorobanService: undefined,
}));

import {
  Account,
  Address,
  Contract,
  StrKey,
  TransactionBuilder,
  nativeToScVal,
  xdr,
} from "@stellar/stellar-sdk";
import { SorobanService } from "./soroban";
import { FreighterError } from "./error-handler";

const POOL_CONTRACT_ID =
  "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABSC4";
const USER_PUBLIC_KEY = StrKey.encodeEd25519PublicKey(Buffer.alloc(32, 7));
const POOL_ID = "pool-xlm";
const CORRECT_PASSPHRASE = "Test SDF Network ; September 2015";
const WRONG_PASSPHRASE = "Public Global Stellar Network ; September 2015";

function makeAuthEntry(functionName: string) {
  const contractFn = new xdr.InvokeContractArgs({
    contractAddress: Address.fromString(POOL_CONTRACT_ID).toScAddress(),
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

function makeService() {
  const rpcServer = {
    getAccount: vi.fn().mockResolvedValue(new Account(USER_PUBLIC_KEY, "0")),
    simulateTransaction: vi.fn().mockResolvedValue({
      result: { auth: [makeAuthEntry("lock_assets")] },
      minResourceFee: "100",
    }),
    sendTransaction: vi.fn().mockResolvedValue({ status: "PENDING", hash: "tx-hash" }),
    getTransaction: vi.fn().mockResolvedValue({ status: "SUCCESS" }),
    getLatestLedger: vi.fn().mockResolvedValue({ sequence: 200_000 }),
    getEvents: vi.fn().mockResolvedValue({ events: [] }),
  };

  assembleTransactionMock.mockImplementation((_tx: unknown, sim: unknown) => ({
    build: () => ({
      toXDR: () => "mock-xdr",
    }),
  }));

  const service = new SorobanService();
  const svc = service as unknown as {
    poolContracts: Map<string, Contract>;
    rpcServer: typeof rpcServer;
  };
  svc.rpcServer = rpcServer;
  const poolContract = new Contract(POOL_CONTRACT_ID);
  svc.poolContracts.set(POOL_ID, poolContract);

  return { service, rpcServer };
}

describe("SorobanService network passphrase guard", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("allows signing when wallet network matches", async () => {
    const { service, rpcServer } = makeService();
    const walletApi = {
      signTransaction: vi.fn(async (xdr: string) => xdr),
      getNetworkDetails: vi.fn(async () => ({
        network: "TESTNET",
        networkPassphrase: CORRECT_PASSPHRASE,
      })),
    };

    const result = await service.lockAssets(
      POOL_ID,
      USER_PUBLIC_KEY,
      "50000000",
      walletApi,
    );

    expect(result.success).toBe(true);
    expect(walletApi.getNetworkDetails).toHaveBeenCalled();
    expect(walletApi.signTransaction).toHaveBeenCalled();
    expect(rpcServer.sendTransaction).toHaveBeenCalled();
  });

  it("allows signing when getNetworkDetails is not available", async () => {
    const { service } = makeService();
    const walletApi = {
      signTransaction: vi.fn(async (xdr: string) => xdr),
    };

    const result = await service.lockAssets(
      POOL_ID,
      USER_PUBLIC_KEY,
      "50000000",
      walletApi,
    );

    expect(result.success).toBe(true);
    expect(walletApi.signTransaction).toHaveBeenCalled();
  });

  it("throws FreighterError when wallet network mismatches in lockAssets", async () => {
    const { service } = makeService();
    const walletApi = {
      signTransaction: vi.fn(async (xdr: string) => xdr),
      getNetworkDetails: vi.fn(async () => ({
        network: "PUBLIC",
        networkPassphrase: WRONG_PASSPHRASE,
      })),
    };

    await expect(
      service.lockAssets(POOL_ID, USER_PUBLIC_KEY, "50000000", walletApi),
    ).rejects.toThrow(FreighterError);

    expect(walletApi.signTransaction).not.toHaveBeenCalled();
  });

  it("throws FreighterError when wallet network mismatches in unlockAssets", async () => {
    const { service } = makeService();
    rpcServer.simulateTransaction.mockResolvedValue({
      result: { auth: [makeAuthEntry("unlock_assets")] },
      minResourceFee: "100",
    });
    const walletApi = {
      signTransaction: vi.fn(async (xdr: string) => xdr),
      getNetworkDetails: vi.fn(async () => ({
        network: "PUBLIC",
        networkPassphrase: WRONG_PASSPHRASE,
      })),
    };

    await expect(
      service.unlockAssets(POOL_ID, USER_PUBLIC_KEY, "50000000", walletApi),
    ).rejects.toThrow(FreighterError);

    expect(walletApi.signTransaction).not.toHaveBeenCalled();
  });

  it("throws FreighterError when wallet network mismatches in setBoost", async () => {
    const { service } = makeService();
    rpcServer.simulateTransaction.mockResolvedValue({
      result: { auth: [makeAuthEntry("set_boost")] },
      minResourceFee: "100",
    });
    const walletApi = {
      signTransaction: vi.fn(async (xdr: string) => xdr),
      getNetworkDetails: vi.fn(async () => ({
        network: "PUBLIC",
        networkPassphrase: WRONG_PASSPHRASE,
      })),
    };

    await expect(
      service.setBoost(POOL_ID, USER_PUBLIC_KEY, 50, walletApi),
    ).rejects.toThrow(FreighterError);

    expect(walletApi.signTransaction).not.toHaveBeenCalled();
  });

  it("does not submit transaction when network guard rejects", async () => {
    const { service, rpcServer } = makeService();
    const walletApi = {
      signTransaction: vi.fn(async (xdr: string) => xdr),
      getNetworkDetails: vi.fn(async () => ({
        network: "PUBLIC",
        networkPassphrase: WRONG_PASSPHRASE,
      })),
    };

    await expect(
      service.lockAssets(POOL_ID, USER_PUBLIC_KEY, "50000000", walletApi),
    ).rejects.toThrow();

    expect(rpcServer.sendTransaction).not.toHaveBeenCalled();
  });
});

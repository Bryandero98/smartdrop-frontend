/** A user's staked position in a farm, including time-lock metadata. */
export type FarmPosition = {
  /** Stable identifier so UI updates survive re-renders. */
  id: string;
  /** Soroban contract id for this pool. */
  contractAddress?: string;
  name: string;
  img: string;
  earned: string;
  /** Current staked balance, display string (e.g. "5.398"). */
  stake: string;
  dailyRate: string;
  totalStakedLiquidity: string;
  /** Token symbol of the locked asset. */
  symbol: string;
  /** Amount currently locked, in display units. */
  lockedAmount: number;
  /** Pool minimum deposit in display units. If set and remaining < this after unlock, contract closes the position entirely. */
  minDepositAmount?: number;
  /** Unix epoch (ms) when the position was locked. */
  lockedAt: number;
  /** Minimum lock period (seconds) before the position can be unlocked. */
  lockPeriodSeconds: number;
  /** Current boost allocation percentage (0-100) if set. */
  boostAllocation?: number;
};

/** Epoch (ms) at which a position becomes eligible for unlock. */
export function unlockAvailableAt(position: FarmPosition): number {
  return position.lockedAt + position.lockPeriodSeconds * 1000;
}

/**
 * Represents each stage of an in-progress deposit (lock) transaction.
 *
 * idle       – no deposit in progress
 * simulating – building the Soroban transaction and running simulateTransaction
 * signing    – Freighter popup is open, waiting for user approval
 * submitting – sendTransaction sent, polling waitForConfirmation
 * success    – transaction confirmed on-chain
 * error      – any step above failed
 */
export type DepositStep =
  | "idle"
  | "simulating"
  | "signing"
  | "submitting"
  | "success"
  | "error";

/** Human-readable label shown in the modal for each DepositStep. */
export const DEPOSIT_STEP_LABEL: Record<DepositStep, string> = {
  idle: "",
  simulating: "Estimating fees…",
  signing: "Waiting for Freighter signature…",
  submitting: "Waiting for on-chain confirmation…",
  success: "Deposit confirmed!",
  error: "",
};

/** Snapshot saved after a successful deposit for display in the success screen. */
export type DepositRecord = {
  poolId: string;
  symbol: string;
  /** Display amount the user entered (in token units, not stroops). */
  displayAmount: number;
  txHash: string;
  confirmedAt: number;
};

/** Convert a display amount (token units) to Soroban i128 stroops string. */
export function toStroops(displayAmount: number): string {
  return String(Math.round(displayAmount * 10_000_000));
}

/** Whether a DepositStep represents an in-flight operation (blocks dismiss). */
export function isDepositPending(step: DepositStep): boolean {
  return step === "simulating" || step === "signing" || step === "submitting";
}

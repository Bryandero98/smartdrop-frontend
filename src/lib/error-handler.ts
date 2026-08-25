/**
 * Production-ready error handling system for SmartDrop.
 * Provides typed error classes, user-friendly messages, and retry logic.
 */

/**
 * Base error class for all SmartDrop errors.
 * Includes error code, user-friendly message, and optional details for logging.
 */
export abstract class SmartDropError extends Error {
  /** Machine-readable error code for categorization */
  abstract readonly code: string;

  /** User-friendly message (no technical jargon) */
  abstract readonly userMessage: string;

  /** Whether this error is transient and can be retried */
  abstract readonly isTransient: boolean;

  /** Whether this is a critical error that might crash the app */
  abstract readonly isCritical: boolean;

  /** Original error for logging and debugging */
  readonly originalError?: Error;

  constructor(message: string, originalError?: Error) {
    super(message);
    this.name = this.constructor.name;
    this.originalError = originalError;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, SmartDropError.prototype);
  }

  /**
   * Additional context for error logging (not shown to users).
   * Override in subclasses to add specific diagnostic info.
   */
  getLogContext(): Record<string, unknown> {
    return {
      code: this.code,
      message: this.message,
      name: this.name,
      originalError: this.originalError?.message,
    };
  }
}

/**
 * Freighter wallet-related errors.
 */
export class FreighterError extends SmartDropError {
  readonly code: "FREIGHTER_NOT_INSTALLED" | "FREIGHTER_REJECTED" | "FREIGHTER_NETWORK_MISMATCH" | "FREIGHTER_TIMEOUT" | "FREIGHTER_UNKNOWN" | "FREIGHTER_DISCONNECTED_MID_FLOW";
  readonly isTransient: boolean;
  readonly isCritical = true;

  constructor(
    code: FreighterError["code"],
    message: string,
    originalError?: Error
  ) {
    super(message, originalError);
    this.code = code;
    this.isTransient = code === "FREIGHTER_TIMEOUT" || code === "FREIGHTER_DISCONNECTED_MID_FLOW";
    Object.setPrototypeOf(this, FreighterError.prototype);
  }

  readonly userMessage = {
    FREIGHTER_NOT_INSTALLED: "Freighter wallet extension is not installed. Install it from https://www.freighter.app to continue.",
    FREIGHTER_REJECTED: "You rejected the wallet connection request. Please approve to continue.",
    FREIGHTER_NETWORK_MISMATCH: "Your wallet is connected to a different network. Please switch to the correct network and try again.",
    FREIGHTER_TIMEOUT: "Freighter is taking too long to respond. Try again, or reload the page if the extension stays unresponsive.",
    FREIGHTER_UNKNOWN: "Unable to connect to Freighter. Please try again or reinstall the extension.",
    FREIGHTER_DISCONNECTED_MID_FLOW: "Wallet disconnected during transaction. Please reconnect and try again.",
  }[this.code];

  getLogContext() {
    return {
      ...super.getLogContext(),
      errorType: "FreighterError",
      isWalletIssue: true,
    };
  }
}

/**
 * RPC endpoint errors (timeout, rate limit, invalid response).
 */
export class RPCError extends SmartDropError {
  readonly code: "RPC_TIMEOUT" | "RPC_RATE_LIMIT" | "RPC_INVALID_RESPONSE" | "RPC_NETWORK_ERROR" | "RPC_UNKNOWN";
  readonly isTransient: boolean;
  readonly isCritical = false;

  constructor(
    code: RPCError["code"],
    message: string,
    originalError?: Error
  ) {
    super(message, originalError);
    this.code = code;
    // Timeout and rate limit are transient, others are not
    this.isTransient = code === "RPC_TIMEOUT" || code === "RPC_RATE_LIMIT" || code === "RPC_NETWORK_ERROR";
    Object.setPrototypeOf(this, RPCError.prototype);
  }

  readonly userMessage = {
    RPC_TIMEOUT: "Request timed out. Please try again.",
    RPC_RATE_LIMIT: "Too many requests. Please wait a moment and try again.",
    RPC_INVALID_RESPONSE: "Invalid response from blockchain. Please refresh and try again.",
    RPC_NETWORK_ERROR: "Network connection error. Please check your internet connection.",
    RPC_UNKNOWN: "Blockchain service error. Please try again later.",
  }[this.code];

  getLogContext() {
    return {
      ...super.getLogContext(),
      errorType: "RPCError",
      isTransient: this.isTransient,
    };
  }
}

/**
 * Smart contract interaction errors.
 */
export class ContractError extends SmartDropError {
  readonly code: "CONTRACT_INSUFFICIENT_BALANCE" | "CONTRACT_AUTHORIZATION_FAILED" | "CONTRACT_INVALID_PARAMETERS" | "CONTRACT_EXECUTION_FAILED" | "CONTRACT_NOT_FOUND";
  readonly isTransient = false;
  readonly isCritical = false;

  constructor(
    code: ContractError["code"],
    message: string,
    originalError?: Error
  ) {
    super(message, originalError);
    this.code = code;
    Object.setPrototypeOf(this, ContractError.prototype);
  }

  readonly userMessage = {
    CONTRACT_INSUFFICIENT_BALANCE: "You don't have enough balance to complete this action. Please check your account balance.",
    CONTRACT_AUTHORIZATION_FAILED: "This action is not authorized. You may not have the required permissions.",
    CONTRACT_INVALID_PARAMETERS: "Invalid parameters for this action. Please check your input.",
    CONTRACT_EXECUTION_FAILED: "Contract execution failed. Please try again.",
    CONTRACT_NOT_FOUND: "Contract not found on the blockchain. Please check the contract address.",
  }[this.code];

  getLogContext() {
    return {
      ...super.getLogContext(),
      errorType: "ContractError",
    };
  }
}

/**
 * User input validation errors.
 */
export class ValidationError extends SmartDropError {
  readonly code = "VALIDATION_ERROR";
  readonly isTransient = false;
  readonly isCritical = false;

  constructor(message: string, originalError?: Error) {
    super(message, originalError);
    Object.setPrototypeOf(this, ValidationError.prototype);
  }

  readonly userMessage = this.message; // Use the provided message directly

  getLogContext() {
    return {
      ...super.getLogContext(),
      errorType: "ValidationError",
    };
  }
}

/**
 * Security-sensitive transaction validation errors.
 */
export class SecurityError extends SmartDropError {
  readonly code = "SECURITY_ERROR";
  readonly isTransient = false;
  readonly isCritical = true;

  constructor(message: string, originalError?: Error) {
    super(message, originalError);
    Object.setPrototypeOf(this, SecurityError.prototype);
  }

  readonly userMessage = this.message;

  getLogContext() {
    return {
      ...super.getLogContext(),
      errorType: "SecurityError",
      isSigningSafetyIssue: true,
    };
  }
}

/**
 * Configuration errors (missing env vars, invalid config).
 */
export class ConfigError extends SmartDropError {
  readonly code = "CONFIG_ERROR";
  readonly isTransient = false;
  readonly isCritical = true;

  constructor(message: string, originalError?: Error) {
    super(message, originalError);
    Object.setPrototypeOf(this, ConfigError.prototype);
  }

  readonly userMessage = "Application configuration error. Please contact support.";

  getLogContext() {
    return {
      ...super.getLogContext(),
      errorType: "ConfigError",
    };
  }
}

/**
 * Unmapped/unknown errors.
 */
export class UnknownError extends SmartDropError {
  readonly code = "UNKNOWN_ERROR";
  readonly isTransient = false;
  readonly isCritical = true;

  constructor(message: string, originalError?: Error) {
    super(message, originalError);
    Object.setPrototypeOf(this, UnknownError.prototype);
  }

  readonly userMessage = "An unexpected error occurred. Please try again or contact support.";

  getLogContext() {
    return {
      ...super.getLogContext(),
      errorType: "UnknownError",
      originalStack: this.originalError?.stack,
    };
  }
}

/**
 * Normalize any error into a SmartDropError for consistent handling.
 */
export function normalizeError(error: unknown, context?: string): SmartDropError {
  // Already a SmartDropError
  if (error instanceof SmartDropError) {
    return error;
  }

  // Standard Error
  if (error instanceof Error) {
    const msg = error.message.toLowerCase();

    // Freighter errors — check sign-rejection first so "user declined" messages
    // that don't contain the word "freighter" are still caught correctly.
    const isSignRejection =
      msg.includes("user declined") ||
      msg.includes("user rejected") ||
      msg.includes("user denied") ||
      msg.includes("transaction was rejected") ||
      msg.includes("signing was rejected");

    if (isSignRejection) {
      return new FreighterError(
        "FREIGHTER_REJECTED",
        "You declined the signature request in Freighter. Approve the transaction to continue.",
        error,
      );
    }

    if (msg.includes("freighter") || msg.includes("wallet")) {
      if (msg.includes("not installed") || msg.includes("not available")) {
        return new FreighterError("FREIGHTER_NOT_INSTALLED", error.message, error);
      }
      if (msg.includes("rejected") || msg.includes("denied")) {
        return new FreighterError("FREIGHTER_REJECTED", error.message, error);
      }
      if (msg.includes("network") || msg.includes("mismatch")) {
        return new FreighterError("FREIGHTER_NETWORK_MISMATCH", error.message, error);
      }
      return new FreighterError("FREIGHTER_UNKNOWN", error.message, error);
    }

    // Security/signing-safety errors
    if (
      msg.includes("security") ||
      msg.includes("signing was blocked") ||
      msg.includes("authorization entry") ||
      msg.includes("unexpected auth") ||
      msg.includes("simulation auth") ||
      msg.includes("simulated authorization")
    ) {
      return new SecurityError(error.message, error);
    }


    // RPC errors
    if (msg.includes("timeout") || msg.includes("timed out")) {
      return new RPCError("RPC_TIMEOUT", error.message, error);
    }
    if (msg.includes("rate limit") || msg.includes("too many requests")) {
      return new RPCError("RPC_RATE_LIMIT", error.message, error);
    }
    if (msg.includes("invalid") || msg.includes("malformed")) {
      return new RPCError("RPC_INVALID_RESPONSE", error.message, error);
    }
    if (msg.includes("network") || msg.includes("connection")) {
      return new RPCError("RPC_NETWORK_ERROR", error.message, error);
    }

    // Contract errors
    if (msg.includes("insufficient") || msg.includes("balance")) {
      return new ContractError("CONTRACT_INSUFFICIENT_BALANCE", error.message, error);
    }
    if (msg.includes("authorized") || msg.includes("forbidden") || msg.includes("permission")) {
      return new ContractError("CONTRACT_AUTHORIZATION_FAILED", error.message, error);
    }

    // Default to unknown error
    return new UnknownError(
      context ? `${context}: ${error.message}` : error.message,
      error
    );
  }

  // Non-Error thrown values
  const message = typeof error === "string" ? error : JSON.stringify(error);
  return new UnknownError(
    context ? `${context}: ${message}` : message
  );
}

/**
 * Retry configuration for transient errors.
 */
export interface RetryConfig {
  /** Maximum number of retry attempts */
  maxAttempts: number;
  /** Initial delay in milliseconds */
  initialDelayMs: number;
  /** Maximum delay in milliseconds */
  maxDelayMs: number;
  /** Multiplier for exponential backoff */
  backoffMultiplier: number;
}

const DEFAULT_RETRY_CONFIG: RetryConfig = {
  maxAttempts: 3,
  initialDelayMs: 500,
  maxDelayMs: 5000,
  backoffMultiplier: 2,
};

/**
 * Exponential backoff delay calculation.
 */
function calculateBackoffDelay(
  attempt: number,
  config: RetryConfig
): number {
  const delay = config.initialDelayMs * Math.pow(config.backoffMultiplier, attempt);
  return Math.min(delay, config.maxDelayMs);
}

/**
 * Retry a function with exponential backoff.
 * Only retries on transient errors.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  config: Partial<RetryConfig> = {}
): Promise<T> {
  const finalConfig = { ...DEFAULT_RETRY_CONFIG, ...config };
  let lastError: SmartDropError | null = null;

  for (let attempt = 0; attempt < finalConfig.maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      const normalized = normalizeError(error);
      lastError = normalized;

      // Don't retry if not transient
      if (!normalized.isTransient) {
        throw normalized;
      }

      // Don't retry on last attempt
      if (attempt === finalConfig.maxAttempts - 1) {
        throw normalized;
      }

      // Calculate and apply backoff delay
      const delayMs = calculateBackoffDelay(attempt, finalConfig);
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }

  // Should never reach here, but satisfy TypeScript
  if (lastError) throw lastError;
  throw new UnknownError("Retry exhausted without error");
}

/**
 * Error logger for development and production.
 * In production, can send to an error tracking service.
 */
export class ErrorLogger {
  private isDevelopment = typeof window !== "undefined" && !window.location.hostname.includes("localhost") === false;

  log(error: SmartDropError, context?: string): void {
    const logData = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      context,
      ...error.getLogContext(),
    };

    if (this.isDevelopment) {
      console.error("[SmartDrop Error]", logData);
    }

    // TODO: Send to error tracking service (Sentry, LogRocket, etc.) in production
    // if (!this.isDevelopment) {
    //   captureException(error, { contexts: { smartdrop: logData } });
    // }
  }

  logUnhandledRejection(error: PromiseRejectionEvent): void {
    const normalized = normalizeError(error.reason);
    this.log(normalized, "Unhandled Promise Rejection");
  }

  logErrorEvent(error: ErrorEvent): void {
    const normalized = normalizeError(error.error || error.message);
    this.log(normalized, "Global Error Event");
  }
}

export const errorLogger = new ErrorLogger();

/**
 * Set up global error listeners for unhandled errors and rejections.
 * Call this once during app initialization.
 */
export function setupGlobalErrorHandlers(): () => void {
  const handleUnhandledRejection = (event: PromiseRejectionEvent) => {
    errorLogger.logUnhandledRejection(event);
  };

  const handleError = (event: ErrorEvent) => {
    errorLogger.logErrorEvent(event);
  };

  if (typeof window !== "undefined") {
    window.addEventListener("unhandledrejection", handleUnhandledRejection);
    window.addEventListener("error", handleError);
  }

  // Return cleanup function
  return () => {
    if (typeof window !== "undefined") {
      window.removeEventListener("unhandledrejection", handleUnhandledRejection);
      window.removeEventListener("error", handleError);
    }
  };
}

// --- merged from errorHandler.ts ---
/**
 * Comprehensive Error Handling System for SmartDrop
 * Handles Freighter, Soroban, and general application errors
 */

export enum ErrorType {
  WALLET_NOT_CONNECTED = 'WALLET_NOT_CONNECTED',
  WALLET_NOT_INSTALLED = 'WALLET_NOT_INSTALLED',
  TRANSACTION_REJECTED = 'TRANSACTION_REJECTED',
  NETWORK_MISMATCH = 'NETWORK_MISMATCH',
  INSUFFICIENT_BALANCE = 'INSUFFICIENT_BALANCE',
  CONTRACT_ERROR = 'CONTRACT_ERROR',
  RPC_ERROR = 'RPC_ERROR',
  RATE_LIMIT = 'RATE_LIMIT',
  TIMEOUT = 'TIMEOUT',
  INVALID_AMOUNT = 'INVALID_AMOUNT',
  MIN_LOCK_PERIOD = 'MIN_LOCK_PERIOD',
  ALREADY_LOCKED = 'ALREADY_LOCKED',
  NOT_UNLOCKABLE = 'NOT_UNLOCKABLE',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface AppError {
  type: ErrorType;
  message: string;
  userMessage: string;
  retryable: boolean;
  actionable: string;
  originalError?: unknown;
}

function isAppError(error: unknown): error is AppError {
  return (
    typeof error === 'object' &&
    error !== null &&
    'type' in error &&
    'userMessage' in error
  );
}

export class ErrorHandler {
  /**
   * Parse and classify different types of errors
   */
  static parseError(error: unknown): AppError {
    // Check if it's already an AppError
    if (isAppError(error)) {
      return error;
    }

    const errorMessage =
      error instanceof Error ? error.message : String(error ?? 'Unknown error');

    // Freighter Wallet Errors
    if (errorMessage.includes('Freighter') || errorMessage.includes('wallet')) {
      if (errorMessage.includes('not installed')) {
        return {
          type: ErrorType.WALLET_NOT_INSTALLED,
          message: errorMessage,
          userMessage: 'Freighter wallet is not installed. Please install it to continue.',
          retryable: false,
          actionable: 'Install Freighter wallet extension from the Chrome Web Store.',
        };
      }

      if (errorMessage.includes('rejected') || errorMessage.includes('cancelled')) {
        return {
          type: ErrorType.TRANSACTION_REJECTED,
          message: errorMessage,
          userMessage: 'Transaction was rejected or cancelled in your wallet.',
          retryable: true,
          actionable: 'Please try again and approve the transaction in your wallet.',
        };
      }

      if (errorMessage.includes('network')) {
        return {
          type: ErrorType.NETWORK_MISMATCH,
          message: errorMessage,
          userMessage: 'Your wallet is connected to a different network.',
          retryable: false,
          actionable: 'Please switch to Stellar Testnet in your Freighter wallet settings.',
        };
      }

      return {
        type: ErrorType.WALLET_NOT_CONNECTED,
        message: errorMessage,
        userMessage: 'Wallet connection error occurred.',
        retryable: true,
        actionable: 'Please reconnect your wallet and try again.',
      };
    }

    // Soroban Contract Errors
    if (errorMessage.includes('insufficient') && errorMessage.includes('balance')) {
      return {
        type: ErrorType.INSUFFICIENT_BALANCE,
        message: errorMessage,
        userMessage: 'You don\'t have enough balance for this transaction.',
        retryable: false,
        actionable: 'Please ensure you have sufficient funds and try again.',
      };
    }

    if (errorMessage.includes('minimum lock period') || errorMessage.includes('lock period not met')) {
      return {
        type: ErrorType.MIN_LOCK_PERIOD,
        message: errorMessage,
        userMessage: 'Assets are still locked. You cannot unlock them yet.',
        retryable: false,
        actionable: 'Please wait for the minimum lock period to expire before unlocking.',
      };
    }

    if (errorMessage.includes('already locked') || errorMessage.includes('position exists')) {
      return {
        type: ErrorType.ALREADY_LOCKED,
        message: errorMessage,
        userMessage: 'You already have assets locked in this pool.',
        retryable: false,
        actionable: 'Check your existing position or unlock before locking new assets.',
      };
    }

    if (errorMessage.includes('not unlockable') || errorMessage.includes('cannot unlock')) {
      return {
        type: ErrorType.NOT_UNLOCKABLE,
        message: errorMessage,
        userMessage: 'These assets cannot be unlocked at this time.',
        retryable: false,
        actionable: 'Check the lock period requirements and your position status.',
      };
    }

    // RPC and Network Errors
    if (errorMessage.includes('timeout') || errorMessage.includes('TIMEOUT')) {
      return {
        type: ErrorType.TIMEOUT,
        message: errorMessage,
        userMessage: 'The request timed out. The network might be congested.',
        retryable: true,
        actionable: 'Please wait a moment and try again.',
      };
    }

    if (errorMessage.includes('rate limit') || errorMessage.includes('429')) {
      return {
        type: ErrorType.RATE_LIMIT,
        message: errorMessage,
        userMessage: 'Too many requests. Please slow down.',
        retryable: true,
        actionable: 'Wait a few seconds before trying again.',
      };
    }

    if (errorMessage.includes('RPC') || errorMessage.includes('network') || errorMessage.includes('connection')) {
      return {
        type: ErrorType.RPC_ERROR,
        message: errorMessage,
        userMessage: 'Network connection issue. Unable to reach Stellar network.',
        retryable: true,
        actionable: 'Check your internet connection and try again.',
      };
    }

    // Contract Simulation/Execution Errors
    if (errorMessage.includes('simulation failed') || errorMessage.includes('contract')) {
      return {
        type: ErrorType.CONTRACT_ERROR,
        message: errorMessage,
        userMessage: 'Smart contract operation failed.',
        retryable: false,
        actionable: 'Please check your transaction parameters and try again.',
      };
    }

    // Validation Errors
    if (errorMessage.includes('invalid amount') || errorMessage.includes('amount must be')) {
      return {
        type: ErrorType.INVALID_AMOUNT,
        message: errorMessage,
        userMessage: 'The amount entered is invalid.',
        retryable: false,
        actionable: 'Please enter a valid positive amount.',
      };
    }

    // Default case
    return {
      type: ErrorType.UNKNOWN_ERROR,
      message: errorMessage,
      userMessage: 'An unexpected error occurred.',
      retryable: true,
      actionable: 'Please try again. If the problem persists, contact support.',
      originalError: error,
    };
  }

  /**
   * Get appropriate toast configuration for an error
   */
  static getToastConfig(error: AppError) {
    return {
      title: this.getErrorTitle(error.type),
      description: error.userMessage,
      status: 'error' as const,
      duration: this.getErrorDuration(error.type),
      isClosable: true,
    };
  }

  /**
   * Get user-friendly error titles
   */
  private static getErrorTitle(type: ErrorType): string {
    switch (type) {
      case ErrorType.WALLET_NOT_INSTALLED:
        return 'Wallet Not Found';
      case ErrorType.WALLET_NOT_CONNECTED:
        return 'Wallet Connection Error';
      case ErrorType.TRANSACTION_REJECTED:
        return 'Transaction Rejected';
      case ErrorType.NETWORK_MISMATCH:
        return 'Network Error';
      case ErrorType.INSUFFICIENT_BALANCE:
        return 'Insufficient Balance';
      case ErrorType.CONTRACT_ERROR:
        return 'Contract Error';
      case ErrorType.RPC_ERROR:
        return 'Network Error';
      case ErrorType.RATE_LIMIT:
        return 'Too Many Requests';
      case ErrorType.TIMEOUT:
        return 'Request Timeout';
      case ErrorType.INVALID_AMOUNT:
        return 'Invalid Amount';
      case ErrorType.MIN_LOCK_PERIOD:
        return 'Assets Still Locked';
      case ErrorType.ALREADY_LOCKED:
        return 'Already Locked';
      case ErrorType.NOT_UNLOCKABLE:
        return 'Cannot Unlock';
      default:
        return 'Error';
    }
  }

  /**
   * Get appropriate toast duration based on error type
   */
  private static getErrorDuration(type: ErrorType): number {
    switch (type) {
      case ErrorType.TRANSACTION_REJECTED:
      case ErrorType.RATE_LIMIT:
        return 3000;
      case ErrorType.TIMEOUT:
      case ErrorType.INVALID_AMOUNT:
        return 5000;
      case ErrorType.WALLET_NOT_INSTALLED:
      case ErrorType.NETWORK_MISMATCH:
      case ErrorType.INSUFFICIENT_BALANCE:
        return 8000;
      default:
        return 6000;
    }
  }

  /**
   * Check if an error is retryable with exponential backoff
   */
  static shouldRetry(error: AppError, attemptCount: number): boolean {
    if (attemptCount >= 3) return false;
    return error.retryable;
  }

  /**
   * Calculate retry delay with exponential backoff
   */
  static getRetryDelay(attemptCount: number): number {
    return Math.min(1000 * Math.pow(2, attemptCount), 10000);
  }

  /**
   * Log error for debugging (in development) or error reporting (in production)
   */
  static logError(error: AppError, context?: string) {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    if (isDevelopment) {
      console.group(`🚨 ${error.type} ${context ? `(${context})` : ''}`);
      console.error('User Message:', error.userMessage);
      console.error('Technical Message:', error.message);
      console.error('Actionable:', error.actionable);
      console.error('Retryable:', error.retryable);
      if (error.originalError) {
        console.error('Original Error:', error.originalError);
      }
      console.groupEnd();
    } else {
      // In production, you might want to send to an error reporting service
      // like Sentry, LogRocket, or Bugsnag
      console.error('[ERROR]', {
        type: error.type,
        message: error.message,
        context,
        timestamp: new Date().toISOString(),
      });
    }
  }
}

/**
 * Higher-order function for automatic error handling
 */
export function withErrorHandler<T extends unknown[], R>(
  fn: (...args: T) => Promise<R>,
  context?: string
) {
  return async (...args: T): Promise<R> => {
    try {
      return await fn(...args);
    } catch (error) {
      const appError = ErrorHandler.parseError(error);
      ErrorHandler.logError(appError, context);
      throw appError;
    }
  };
}

/**
 * React hook for error handling
 */
export function useErrorHandler() {
  const handleError = (error: unknown, context?: string) => {
    const appError = ErrorHandler.parseError(error);
    ErrorHandler.logError(appError, context);
    return appError;
  };

  const getToastConfig = (error: unknown) => {
    const appError = ErrorHandler.parseError(error);
    return ErrorHandler.getToastConfig(appError);
  };

  return {
    handleError,
    getToastConfig,
    parseError: ErrorHandler.parseError,
  };
}

/**
 * Retry mechanism with exponential backoff
 */
export async function retryWithBackoff<T>(
  fn: () => Promise<T>,
  maxAttempts: number = 3,
  context?: string
): Promise<T> {
  let lastError: AppError;
  
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = ErrorHandler.parseError(error);
      
      if (!ErrorHandler.shouldRetry(lastError, attempt) || attempt === maxAttempts) {
        ErrorHandler.logError(lastError, `${context} (final attempt ${attempt}/${maxAttempts})`);
        throw lastError;
      }
      
      const delay = ErrorHandler.getRetryDelay(attempt);
      console.warn(`Retrying ${context} in ${delay}ms (attempt ${attempt}/${maxAttempts})`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  throw lastError!;
}


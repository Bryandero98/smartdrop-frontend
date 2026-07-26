# Error Handling System

Production-ready error handling across the SmartDrop app with clear user feedback and comprehensive error recovery.

## Overview

The error handling system provides:

- **Typed Error Classes**: Specialized error classes for different failure scenarios (Freighter, RPC, Contract, Validation, etc.)
- **User-Friendly Messages**: Clear, actionable error messages (no technical jargon)
- **Toast Notifications**: Chakra UI toast for consistent, accessible notifications
- **Automatic Logging**: Development logging with optional production error tracking
- **Error Boundaries**: React error boundaries to prevent full app crashes
- **Retry Logic**: Automatic exponential backoff retry for transient failures
- **Global Error Handling**: Catches unhandled promise rejections and errors

## Architecture

### Error Classes Hierarchy

```
SmartDropError (abstract base)
├── FreighterError
├── RPCError
├── ContractError
├── ValidationError
├── ConfigError
└── UnknownError
```

### Core Components

#### 1. Error Handler (`/src/lib/error-handler.ts`)

Defines all error classes and utilities:

```typescript
// Error normalization
const error = normalizeError(unknownError, "context");

// Retry with exponential backoff
const result = await withRetry(
  () => someAsyncFunction(),
  { maxAttempts: 3, initialDelayMs: 500 }
);

// Error logging
errorLogger.log(error, "context");

// Global error setup
setupGlobalErrorHandlers();
```

#### 2. Toast Hook (`/src/hooks/useToast.ts`)

React hook for displaying notifications:

```typescript
const toast = useToast();

// Show notifications
toast.success("Title", "Description");
toast.error("Title", "Description");
toast.info("Title", "Description");
toast.warning("Title", "Description");

// Handle errors (logs + shows user-friendly message)
const error = toast.handleError(err, "context");

// Execute with automatic error handling and success notification
const result = await toast.withErrorHandling(
  async () => someOperation(),
  {
    loadingMessage: "Processing...",
    successMessage: "Done!",
    errorContext: "Operation Name",
    retryConfig: { maxAttempts: 3 }
  }
);
```

#### 3. Error Context (`/src/context/ErrorContext.tsx`)

Provides global access to error handling:

```typescript
// In any component
const toast = useErrorHandler();
toast.success("Done!");
```

#### 4. Error Boundary (`/src/components/ErrorBoundary/ErrorBoundary.tsx`)

Catches React component errors:

```typescript
// Wrap entire app or sections
<ErrorBoundary>
  <MyComponent />
</ErrorBoundary>

// With custom fallback
<ErrorBoundary fallback={(error, retry) => <CustomError />}>
  <MyComponent />
</ErrorBoundary>

// Section-level error handling
<ErrorBoundarySection sectionName="Farm">
  <FarmComponent />
</ErrorBoundarySection>
```

## Usage Examples

### Example 1: Wallet Connection

```typescript
"use client";
import { useStellarWallet } from "@/context/StellarWalletContext";
import { useErrorHandler } from "@/context/ErrorContext";

export function ConnectButton() {
  const { connect } = useStellarWallet();
  const toast = useErrorHandler();

  const handleConnect = async () => {
    try {
      await connect();
      toast.success("Connected", "Wallet connected successfully");
    } catch (error) {
      toast.handleError(error, "Wallet Connection");
    }
  };

  return <Button onClick={handleConnect}>Connect</Button>;
}
```

### Example 2: Transaction with Retry and Success Feedback

```typescript
const handleUnlock = async () => {
  const result = await toast.withErrorHandling(
    async () => unlockAssets(params),
    {
      loadingMessage: "Processing unlock...",
      successMessage: "Assets unlocked successfully!",
      errorContext: "Unlock Assets",
      retryConfig: { maxAttempts: 3 }
    }
  );

  if (result) {
    // Update UI with result
  }
};
```

### Example 3: Manual Error Handling

```typescript
try {
  const result = await someAsyncOperation();
} catch (error) {
  const normalized = toast.handleError(error, "Operation Context");

  // Check error type
  if (normalized instanceof FreighterError) {
    // Handle wallet issues
  } else if (normalized instanceof RPCError) {
    // Handle RPC issues
  }
}
```

### Example 4: Form Validation

```typescript
const handleSubmit = async (formData) => {
  try {
    if (!formData.amount || formData.amount <= 0) {
      throw new ValidationError("Amount must be greater than zero");
    }

    const result = await submitTransaction(formData);
    toast.success("Success", "Transaction submitted");
  } catch (error) {
    toast.handleError(error, "Form Submission");
  }
};
```

## Error Types

### FreighterError

Wallet connection and signing errors:

- `FREIGHTER_NOT_INSTALLED`: Extension not found
- `FREIGHTER_REJECTED`: User denied connection
- `FREIGHTER_NETWORK_MISMATCH`: Wallet on wrong network
- `FREIGHTER_TIMEOUT`: Extension did not respond before the connection timeout
- `FREIGHTER_UNKNOWN`: Other wallet issues

**Is Transient**: Only `FREIGHTER_TIMEOUT` (user can retry after reloading or waking the extension)
**Is Critical**: Yes (prevents user interaction)

### RPCError

Blockchain RPC endpoint errors:

- `RPC_TIMEOUT`: Request timed out
- `RPC_RATE_LIMIT`: Too many requests
- `RPC_INVALID_RESPONSE`: Malformed response
- `RPC_NETWORK_ERROR`: Network connectivity issue
- `RPC_UNKNOWN`: Other RPC issues

**Is Transient**: Timeout, rate limit, network errors (can be retried)
**Is Critical**: No

### ContractError

Smart contract execution errors:

- `CONTRACT_INSUFFICIENT_BALANCE`: User lacks required funds
- `CONTRACT_AUTHORIZATION_FAILED`: Missing permissions
- `CONTRACT_INVALID_PARAMETERS`: Invalid input parameters
- `CONTRACT_EXECUTION_FAILED`: Execution failed
- `CONTRACT_NOT_FOUND`: Contract doesn't exist

**Is Transient**: No
**Is Critical**: No

### ValidationError

User input validation errors:

- Generic validation messages

**Is Transient**: No
**Is Critical**: No

### ConfigError

Application configuration errors:

- Missing environment variables

**Is Transient**: No
**Is Critical**: Yes (prevents app function)

### UnknownError

Unmapped/unexpected errors

**Is Transient**: No
**Is Critical**: Yes (unknown impact)

## Best Practices

### 1. Always Use `toast.withErrorHandling` for Long Operations

```typescript
// ✅ Good
const result = await toast.withErrorHandling(
  () => someLongOperation(),
  { loadingMessage: "Please wait...", successMessage: "Done!" }
);

// ❌ Avoid
setPending(true);
try {
  await someLongOperation();
  toast.success("Done!");
} catch (error) {
  toast.handleError(error);
}
```

### 2. Provide Context to Error Handler

```typescript
// ✅ Good
toast.handleError(error, "Unlock Assets");

// ❌ Less helpful
toast.handleError(error);
```

### 3. Validate Early and Throw ValidationError

```typescript
// ✅ Good
if (!amount || amount <= 0) {
  throw new ValidationError("Amount must be positive");
}

// ❌ Avoid
setError("Amount must be positive");
return;
```

### 4. Use Error Boundaries at Component Tree Roots

```typescript
// ✅ Good - App-level
<ErrorBoundary>
  <ErrorProvider>
    <App />
  </ErrorProvider>
</ErrorBoundary>

// ✅ Good - Section-level
<ErrorBoundarySection sectionName="Farm">
  <Farm />
</ErrorBoundarySection>

// ❌ Avoid - Too nested
<ErrorBoundary>
  <Modal>
    <Form>
      <ErrorBoundary>
        <Input />
      </ErrorBoundary>
    </Form>
  </Modal>
</ErrorBoundary>
```

### 5. Configure Retry for Transient Operations

```typescript
// ✅ Good for RPC calls
await toast.withErrorHandling(
  () => fetchData(),
  {
    retryConfig: {
      maxAttempts: 3,
      initialDelayMs: 500,
      backoffMultiplier: 2
    }
  }
);

// ❌ Avoid for non-transient errors
await toast.withErrorHandling(
  () => submitForm(),
  { retryConfig: { maxAttempts: 3 } } // Form errors won't be fixed by retry
);
```

## Integration Checklist

- ✅ Error handler library created (`/src/lib/error-handler.ts`)
- ✅ Toast hook implemented (`/src/hooks/useToast.ts`)
- ✅ Error context provider created (`/src/context/ErrorContext.tsx`)
- ✅ Error boundary component created (`/src/components/ErrorBoundary/ErrorBoundary.tsx`)
- ✅ Context provider updated to include ErrorProvider and ErrorBoundary
- ✅ Wallet context updated to throw proper errors
- ✅ Connect button updated to use toast notifications
- ✅ Unlock modal updated to use error handler
- ✅ Soroban utilities updated to use new error classes

## Development vs Production

### Development

- Errors logged to browser console with full stack traces
- Component stack included for React errors
- Detailed error information displayed in error boundaries

### Production

- Errors logged to browser console (optional)
- Errors can be sent to error tracking service (Sentry, LogRocket, etc.)
- User-friendly messages shown (no technical details)

To enable production error tracking:

```typescript
// In errorLogger.log() method
if (!this.isDevelopment) {
  captureException(error, { contexts: { smartdrop: logData } });
}
```

## Monitoring and Debugging

### Check for Unhandled Errors

1. Browser console - all errors logged in development
2. Error boundary fallback UI - component errors caught
3. Toast notifications - user-visible errors

### Common Issues

**Issue**: "useErrorHandler must be used within ErrorProvider"
**Solution**: Ensure component is wrapped in ErrorProvider (already done in AppShell)

**Issue**: Error not caught by boundary
**Solution**: Error boundaries only catch render-time errors, not async errors. Use try/catch for async.

**Issue**: Same error appearing multiple times
**Solution**: Check if wrapped in multiple ErrorBoundaries or ErrorProviders

## Future Enhancements

- [ ] Sentry integration for production error tracking
- [ ] Custom error recovery strategies per error type
- [ ] Offline error queue with retry on reconnection
- [ ] Error analytics and reporting dashboard
- [ ] User feedback collection on errors
- [ ] Suggested actions for common error scenarios

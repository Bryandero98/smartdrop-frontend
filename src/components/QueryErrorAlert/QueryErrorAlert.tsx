"use client";

import { Alert, AlertIcon, Button, HStack, Text } from "@chakra-ui/react";

export interface QueryErrorAlertProps {
  /** The error thrown by the failed query (TanStack Query's `error`). */
  error: unknown;
  /** Wired to the query's `refetch()`. */
  onRetry: () => void;
  /** Pass the query's `isFetching` so the button shows a spinner while retrying. */
  isRetrying?: boolean;
  /** Shown when `error` isn't an `Error` instance (defensive fallback). */
  fallbackMessage?: string;
}

/**
 * Shared error state for the backend-API pages (Prices, Airdrops, Webhooks,
 * Alerts) — a visible, keyboard-accessible Retry button next to the error
 * message, wired to the query's own `refetch()` so a transient failure
 * recovers in place without a full page reload (#96).
 *
 * A plain Chakra `Button` is a real `<button>` under the hood, so it's
 * focusable and activates on Enter/Space with no extra wiring — the
 * accessibility requirement here falls out of using the right element
 * rather than needing bespoke keyboard handling.
 */
export function QueryErrorAlert({
  error,
  onRetry,
  isRetrying = false,
  fallbackMessage = "Something went wrong.",
}: QueryErrorAlertProps) {
  const message = error instanceof Error ? error.message : fallbackMessage;

  return (
    <Alert status="error" borderRadius="xl">
      <AlertIcon />
      <HStack justify="space-between" flex={1} flexWrap="wrap" gap={3}>
        <Text>{message}</Text>
        <Button
          size="sm"
          variant="outline"
          onClick={onRetry}
          isLoading={isRetrying}
          loadingText="Retrying"
        >
          Retry
        </Button>
      </HStack>
    </Alert>
  );
}

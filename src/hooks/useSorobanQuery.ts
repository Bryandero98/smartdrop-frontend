/**
 * Custom React Query hooks for Soroban contract interactions
 * Provides caching, error handling, and automatic refetching
 */

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getStellarBalance,
  simulateLockAssets,
  sorobanService,
  type UserPosition,
  type TransactionResult,
} from '@/lib/soroban';
import { useStellarWallet } from '@/context/StellarWalletContext';
import { useToast } from '@chakra-ui/react';

// Query Keys
export const QUERY_KEYS = {
  POOLS: 'pools',
  USER_POSITION: 'userPosition',
  USER_CREDITS: 'userCredits',
  PLATFORM_STATS: 'platformStats',
  BOOST_CONFIG: 'boostConfig',
} as const;

/**
 * Hook to fetch all available farming pools
 */
export const usePools = () => {
  return useQuery({
    queryKey: [QUERY_KEYS.POOLS],
    queryFn: () => sorobanService.getFactoryPools(),
    staleTime: 30000, // 30 seconds
    refetchInterval: 60000, // 1 minute
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
  });
};

/**
 * Hook to fetch a pool's top depositors, replacing the one-shot
 * getPoolDepositors() useEffect PoolDetailClient used to call directly
 * (#143) — this way depositor data also refreshes on an interval instead
 * of being frozen at mount for the lifetime of the page view.
 */
export const usePoolDepositors = (poolId: string, limit: number = 20) => {
  return useQuery({
    queryKey: ['poolDepositors', poolId, limit],
    queryFn: () => sorobanService.getPoolDepositors(poolId, limit),
    enabled: !!poolId,
    staleTime: 30000,
    refetchInterval: 60000,
    retry: 2,
  });
};

/**
 * Hook to fetch user position for a specific pool
 */
export const useUserPosition = (poolId: string, enabled: boolean = true) => {
  const { publicKey } = useStellarWallet();

  return useQuery({
    queryKey: [QUERY_KEYS.USER_POSITION, poolId, publicKey],
    queryFn: () => sorobanService.getUserPosition(poolId, publicKey!),
    enabled: enabled && !!publicKey && !!poolId,
    staleTime: 15000, // 15 seconds
    refetchInterval: 30000, // 30 seconds
    retry: 2,
  });
};

/**
 * Hook to calculate user credits for a specific pool
 */
export const useUserCredits = (poolId: string, enabled: boolean = true) => {
  const { publicKey } = useStellarWallet();

  return useQuery({
    queryKey: [QUERY_KEYS.USER_CREDITS, poolId, publicKey],
    queryFn: () => sorobanService.calculateUserCredits(poolId, publicKey!),
    enabled: enabled && !!publicKey && !!poolId,
    staleTime: 5000, // 5 seconds (credits change frequently)
    refetchInterval: 10000, // 10 seconds
    retry: 2,
  });
};

export const useStellarBalance = (publicKey?: string) => {
  return useQuery({
    queryKey: ['stellarBalance', publicKey],
    queryFn: () => getStellarBalance(publicKey!),
    enabled: !!publicKey,
    staleTime: 15000,
    retry: 2,
  });
};

// Matches the debounce pattern already used for search input elsewhere in
// this codebase (`useLeaderboard`'s `SEARCH_DEBOUNCE_MS`).
const LOCK_ASSETS_FEE_PREVIEW_DEBOUNCE_MS = 350;

/**
 * Debounced so a keystroke burst in the deposit amount field doesn't fire a
 * `simulateTransaction` RPC round trip per keystroke (#134) — the query
 * only keys/fires on `amount` once it has stopped changing for
 * `LOCK_ASSETS_FEE_PREVIEW_DEBOUNCE_MS`. Debouncing here, inside the hook,
 * means every caller gets the fix automatically rather than each call site
 * having to remember to debounce its own input state.
 */
export const useLockAssetsFeePreview = (args: {
  publicKey?: string | null;
  poolContractId?: string | null;
  amount?: string;
}) => {
  const amount = args.amount?.trim() ?? '';
  // Starts empty (not seeded from `amount`) so a caller that mounts with a
  // non-empty amount already still goes through the debounce window once,
  // the same as any other change — matching `useLeaderboard`'s
  // `searchQuery`/`searchInput` split, which starts `searchQuery` at `""`
  // rather than at the initial `searchInput` value.
  const [debouncedAmount, setDebouncedAmount] = useState('');

  useEffect(() => {
    const id = setTimeout(
      () => setDebouncedAmount(amount),
      LOCK_ASSETS_FEE_PREVIEW_DEBOUNCE_MS,
    );
    return () => clearTimeout(id);
  }, [amount]);

  const numericAmount = Number(debouncedAmount);
  // A live amount that hasn't settled into debouncedAmount yet is not
  // reflected in the query at all (queryKey/queryFn/enabled all read
  // debouncedAmount below) — surface that as "still fetching" so UI keyed
  // off isFetching shows a pending state for the whole debounce window,
  // not just the network request that follows it.
  const isDebouncing = amount !== debouncedAmount;

  const query = useQuery({
    queryKey: [
      'lockAssetsFeePreview',
      args.publicKey,
      args.poolContractId,
      debouncedAmount,
    ],
    queryFn: () =>
      simulateLockAssets({
        publicKey: args.publicKey!,
        poolContractId: args.poolContractId!,
        amount: debouncedAmount,
      }),
    enabled:
      !!args.publicKey &&
      !!args.poolContractId &&
      !!debouncedAmount &&
      Number.isFinite(numericAmount) &&
      numericAmount > 0,
    staleTime: 10000,
    retry: 1,
  });

  return { ...query, isFetching: query.isFetching || isDebouncing };
};

/**
 * Hook to lock assets in a pool.
 *
 * Accepts an optional onStep callback so callers can drive step-by-step UI
 * without coupling the mutation to internal implementation details.
 */
export const useLockAssets = (options?: {
  onHash?: (hash: string) => void;
  onStep?: (step: "simulating" | "signing" | "submitting") => void;
}) => {
  const { walletApi, publicKey } = useStellarWallet();
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({
      poolId,
      amount,
    }: {
      poolId: string;
      amount: string;
    }) => {
      if (!walletApi || !publicKey) {
        throw new Error('Wallet not connected. Please connect Freighter before depositing.');
      }
      const result = await sorobanService.lockAssets(
        poolId,
        publicKey,
        amount,
        walletApi,
        {
          onHash: options?.onHash,
          onStep: options?.onStep,
        },
      );
      return result;
    },
    onSuccess: (result: TransactionResult, variables) => {
      if (result.success) {
        const shortHash = (result.transactionHash ?? result.hash ?? "").slice(0, 10);
        toast({
          title: 'Assets locked',
          description: shortHash ? `Tx ${shortHash}… confirmed` : 'Deposit confirmed on Stellar',
          status: 'success',
          duration: 6000,
          isClosable: true,
        });

        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.POOLS] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_POSITION] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_POSITION, variables.poolId] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_POSITION, 'all', publicKey] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.USER_CREDITS, variables.poolId] });
        queryClient.invalidateQueries({ queryKey: [QUERY_KEYS.PLATFORM_STATS] });
        queryClient.invalidateQueries({ queryKey: ['stellarBalance', publicKey] });
      } else {
        toast({
          title: 'Deposit failed',
          description: result.error ?? 'Unknown error — please try again',
          status: 'error',
          duration: 8000,
          isClosable: true,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Transaction error',
        description: error.message,
        status: 'error',
        duration: 8000,
        isClosable: true,
      });
    },
  });
};

/**
 * Hook to unlock assets from a pool
 */
export const useUnlockAssets = () => {
  const { walletApi, publicKey } = useStellarWallet();
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({
      poolId,
      amount,
    }: {
      poolId: string;
      amount: string;
    }) => {
      if (!walletApi || !publicKey) {
        throw new Error('Wallet not connected');
      }
      return sorobanService.unlockAssets(poolId, publicKey, amount, walletApi);
    },
    onSuccess: (result: TransactionResult, variables) => {
      if (result.success) {
        toast({
          title: 'Assets Unlocked Successfully',
          description: `Transaction: ${result.transactionHash?.slice(0, 8)}...`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        });

        // Invalidate related queries
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.USER_POSITION, variables.poolId],
        });
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.USER_CREDITS, variables.poolId],
        });
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.PLATFORM_STATS],
        });
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.POOLS],
        });
      } else {
        toast({
          title: 'Unlock Assets Failed',
          description: result.error || 'Unknown error occurred',
          status: 'error',
          duration: 8000,
          isClosable: true,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Transaction Error',
        description: error.message,
        status: 'error',
        duration: 8000,
        isClosable: true,
      });
    },
  });
};

/**
 * Hook to set boost configuration
 */
export const useSetBoost = () => {
  const { walletApi, publicKey } = useStellarWallet();
  const queryClient = useQueryClient();
  const toast = useToast();

  return useMutation({
    mutationFn: async ({
      poolId,
      allocationPercentage,
    }: {
      poolId: string;
      allocationPercentage: number;
    }) => {
      if (!walletApi || !publicKey) {
        throw new Error('Wallet not connected');
      }
      return sorobanService.setBoost(poolId, publicKey, allocationPercentage, walletApi);
    },
    onSuccess: (result: TransactionResult, variables) => {
      if (result.success) {
        toast({
          title: 'Boost Configuration Updated',
          description: `Boost set to ${variables.allocationPercentage}%`,
          status: 'success',
          duration: 5000,
          isClosable: true,
        });

        // Invalidate related queries
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.USER_POSITION, variables.poolId],
        });
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.USER_CREDITS, variables.poolId],
        });
        queryClient.invalidateQueries({
          queryKey: [QUERY_KEYS.BOOST_CONFIG, variables.poolId],
        });
      } else {
        toast({
          title: 'Boost Configuration Failed',
          description: result.error || 'Unknown error occurred',
          status: 'error',
          duration: 8000,
          isClosable: true,
        });
      }
    },
    onError: (error: Error) => {
      toast({
        title: 'Transaction Error',
        description: error.message,
        status: 'error',
        duration: 8000,
        isClosable: true,
      });
    },
  });
};

/**
 * Hook to get all user positions across all pools
 */
export const useAllUserPositions = () => {
  const { publicKey } = useStellarWallet();
  const { data: pools } = usePools();

  return useQuery({
    queryKey: [QUERY_KEYS.USER_POSITION, 'all', publicKey],
    queryFn: async () => {
      if (!publicKey || !pools) return [];

      const positions = await Promise.allSettled(
        pools.map(pool => sorobanService.getUserPosition(pool.id, publicKey))
      );

      return positions
        .map((result, index) => ({
          pool: pools[index],
          position: result.status === 'fulfilled' ? result.value : null,
        }))
        .filter(item => item.position !== null);
    },
    enabled: !!publicKey && !!pools && pools.length > 0,
    staleTime: 15000,
    refetchInterval: 30000,
  });
};

/**
 * Hook to get total user credits across all pools
 */
export const useTotalUserCredits = () => {
  const { publicKey } = useStellarWallet();
  const { data: pools } = usePools();

  return useQuery({
    queryKey: [QUERY_KEYS.USER_CREDITS, 'total', publicKey],
    queryFn: async () => {
      if (!publicKey || !pools) return '0';

      const credits = await Promise.allSettled(
        pools.map(pool => sorobanService.calculateUserCredits(pool.id, publicKey))
      );

      const totalCredits = credits.reduce((total, result) => {
        if (result.status === 'fulfilled') {
          return total + parseFloat(result.value);
        }
        return total;
      }, 0);

      return totalCredits.toString();
    },
    enabled: !!publicKey && !!pools && pools.length > 0,
    staleTime: 10000,
    refetchInterval: 15000,
  });
};

/**
 * Hook for real-time updates with optimistic UI updates
 */
export const useOptimisticUpdate = () => {
  const queryClient = useQueryClient();

  const updateUserPosition = (
    poolId: string,
    userAddress: string,
    updateFn: (old: UserPosition | null) => UserPosition | null
  ) => {
    queryClient.setQueryData(
      [QUERY_KEYS.USER_POSITION, poolId, userAddress],
      updateFn
    );
  };

  const updateCredits = (
    poolId: string,
    userAddress: string,
    newCredits: string
  ) => {
    queryClient.setQueryData(
      [QUERY_KEYS.USER_CREDITS, poolId, userAddress],
      newCredits
    );
  };

  const updatePlatformStats = (
    updateFn: (old: UIPlatformStats | undefined) => UIPlatformStats
  ) => {
    queryClient.setQueryData([QUERY_KEYS.PLATFORM_STATS], updateFn);
  };

  return {
    updateUserPosition,
    updateCredits,
    updatePlatformStats,
  };
};

/**
 * Hook for managing loading states across multiple operations
 */
export const useTransactionStates = () => {
  const lockMutation = useLockAssets();
  const unlockMutation = useUnlockAssets();
  const boostMutation = useSetBoost();

  const isLoading = 
    lockMutation.isPending || 
    unlockMutation.isPending || 
    boostMutation.isPending;

  const hasError = 
    lockMutation.isError || 
    unlockMutation.isError || 
    boostMutation.isError;

  const error = 
    lockMutation.error || 
    unlockMutation.error || 
    boostMutation.error;

  const reset = () => {
    lockMutation.reset();
    unlockMutation.reset();
    boostMutation.reset();
  };

  return {
    isLoading,
    hasError,
    error,
    reset,
    lockAssets: lockMutation.mutate,
    unlockAssets: unlockMutation.mutate,
    setBoost: boostMutation.mutate,
  };
};


export interface UIPlatformStats {
  tvl: string;
  activePools: number;
  totalFarmers: number;
  creditVelocity: string;
  totalValueLocked?: string;
  totalPools?: number;
  totalUsers?: number;
  onlineUsers?: number;
}

export function usePlatformStats(initialData?: UIPlatformStats) {
  return useQuery<UIPlatformStats>({
    queryKey: [QUERY_KEYS.PLATFORM_STATS],
    queryFn: async () => {
      const [stats, velocity] = await Promise.all([
        sorobanService.getPlatformStats(),
        sorobanService.getCreditVelocity(24)
      ]);

      return {
        tvl: stats.totalValueLocked || "0",
        activePools: stats.totalPools || 0,
        totalFarmers: stats.totalUsers || 0,
        creditVelocity: velocity,
        totalValueLocked: stats.totalValueLocked,
        totalPools: stats.totalPools,
        totalUsers: stats.totalUsers,
        onlineUsers: stats.onlineUsers,
      };
    },
    staleTime: 60000,        // Keeps data fresh for 1 minute
    refetchInterval: 120000, // Re-checks the blockchain automatically every 2 minutes
    initialData: initialData
  });
}

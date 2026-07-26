'use client';

import React from 'react';
import { SimpleGrid, Stat, StatLabel, StatNumber, Box, Skeleton } from '@chakra-ui/react';
import { usePlatformStats, UIPlatformStats } from '@/hooks/useSorobanQuery';

const formatCredits = (value: string): string => {
  const num = parseFloat(value) || 0;
  return `${(num / 1_000_000).toFixed(1)}M XLM`;
};

interface PlatformStatsProps {
  initialData?: UIPlatformStats;
}

const cardProps = {
  p: 5,
  borderWidth: '1px',
  borderColor: 'app.border',
  borderRadius: 'card',
  bg: 'app.surface',
  boxShadow: 'card',
  transition: 'all 0.2s ease',
  _hover: { borderColor: 'app.borderHover', transform: 'translateY(-2px)' },
} as const;

export const PlatformStats: React.FC<PlatformStatsProps> = ({ initialData }) => {
  const { data, isLoading } = usePlatformStats(initialData);
  const stats = data || initialData;

  return (
    <SimpleGrid columns={{ base: 2, md: 4 }} spacing={5} mb={8} width="100%">
      <Box {...cardProps}>
        <Stat>
          <StatLabel color="app.muted">Total Value Locked</StatLabel>
          <Skeleton isLoaded={!isLoading || !!stats} startColor="app.border" endColor="app.surfaceHover">
            <StatNumber fontSize="2xl" fontWeight="extrabold" color="app.accent">
              {stats ? formatCredits(stats.tvl) : '0.0M XLM'}
            </StatNumber>
          </Skeleton>
        </Stat>
      </Box>

      <Box {...cardProps}>
        <Stat>
          <StatLabel color="app.muted">Active Pools</StatLabel>
          <Skeleton isLoaded={!isLoading || !!stats} startColor="app.border" endColor="app.surfaceHover">
            <StatNumber fontSize="2xl" fontWeight="extrabold" color="app.accent2">
              {stats ? stats.activePools : 0}
            </StatNumber>
          </Skeleton>
        </Stat>
      </Box>

      <Box {...cardProps}>
        <Stat>
          <StatLabel color="app.muted">Total Farmers</StatLabel>
          <Skeleton isLoaded={!isLoading || !!stats} startColor="app.border" endColor="app.surfaceHover">
            <StatNumber fontSize="2xl" fontWeight="extrabold" color="app.accent">
              {stats ? stats.totalFarmers.toLocaleString() : 0}
            </StatNumber>
          </Skeleton>
        </Stat>
      </Box>

      <Box {...cardProps}>
        <Stat>
          <StatLabel color="app.muted">24h Credit Velocity</StatLabel>
          <Skeleton isLoaded={!isLoading || !!stats} startColor="app.border" endColor="app.surfaceHover">
            <StatNumber fontSize="2xl" fontWeight="extrabold" color="app.accent2">
              {stats ? formatCredits(stats.creditVelocity) : '0.0M XLM'}
            </StatNumber>
          </Skeleton>
        </Stat>
      </Box>
    </SimpleGrid>
  );
};

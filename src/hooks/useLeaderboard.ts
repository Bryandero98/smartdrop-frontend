import { useCallback, useEffect, useState } from "react";
import { sorobanService } from "@/lib/soroban";

export type SortKey = "credits" | "stake";

export type LeaderboardEntry = {
  address: string;
  totalCredits: number;
  totalStake: number;
  /** null when unavailable in the current data source (issue #142). */
  boostUtilization: number | null;
};

export const PAGE_SIZE = 10;
const REFRESH_MS = 30_000;
const SEARCH_DEBOUNCE_MS = 300;

export function fetchLeaderboard(
  offset: number,
  limit: number,
  sortKey: SortKey,
  search?: string
): Promise<{ entries: LeaderboardEntry[]; total: number }> {
  return sorobanService.getLeaderboard(offset, limit, sortKey, search);
}

export function useLeaderboard(publicKey: string | null) {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [sortKey, setSortKeyState] = useState<SortKey>("credits");
  const [searchInput, setSearchInput] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPageState] = useState(1);
  const [lastRefreshed, setLastRefreshed] = useState<Date | null>(null);

  useEffect(() => {
    const id = setTimeout(() => setSearchQuery(searchInput), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(id);
  }, [searchInput]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const offset = (currentPage - 1) * PAGE_SIZE;

  const refresh = useCallback(() => {
    setIsLoading(true);
    fetchLeaderboard(offset, PAGE_SIZE, sortKey, searchQuery || undefined)
      .then(({ entries, total }) => {
        setEntries(entries);
        setTotal(total);
        setLastRefreshed(new Date());
      })
      .catch(() => {
        setEntries([]);
        setTotal(0);
      })
      .finally(() => setIsLoading(false));
  }, [offset, sortKey, searchQuery]);

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, REFRESH_MS);
    return () => clearInterval(id);
  }, [refresh]);

  const paged = entries;

  const connectedRank = (() => {
    if (!publicKey) return 0;
    const idx = entries.findIndex((e) => e.address === publicKey);
    return idx === -1 ? 0 : offset + idx + 1;
  })();

  const setSortKey = (key: SortKey) => {
    setSortKeyState(key);
    setPageState(1);
  };

  // Reset to page 1 when search query changes
  useEffect(() => {
    if (searchQuery) {
      setPageState(1);
    }
  }, [searchQuery]);

  return {
    paged,
    isLoading,
    sortKey,
    setSortKey,
    searchQuery: searchInput,
    setSearchQuery: setSearchInput,
    currentPage,
    totalPages,
    setPage: setPageState,
    connectedRank,
    filteredCount: total,
    lastRefreshed,
    refresh,
  };
}

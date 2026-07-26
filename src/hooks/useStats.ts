import { useQuery } from "@tanstack/react-query";
import { fetchStats, type StatsData } from "@/lib/stats";

const REFETCH_INTERVAL_MS = 60_000;

/**
 * Fetch live TVL / user metrics, re-polling every 60 seconds.
 *
 * In a server deployment (Vercel / next start) the request hits /api/stats
 * which returns a Next.js-cached response. When /api/stats is unavailable
 * (e.g. static GitHub Pages export), the queryFn falls back to calling
 * fetchStats() directly from the browser so the dashboard always renders.
 */
async function queryFn(): Promise<StatsData> {
  // Try the cached API route first (server deployment).
  try {
    const res = await fetch("/api/stats", { cache: "no-store" });
    if (res.ok) return (await res.json()) as StatsData;
  } catch {
    // /api/stats unavailable — fall through to client-side fetch.
  }
  return fetchStats();
}

export function useStats() {
  return useQuery<StatsData>({
    queryKey: ["stats"],
    queryFn,
    staleTime: REFETCH_INTERVAL_MS,
    refetchInterval: REFETCH_INTERVAL_MS,
    // Keep previous data visible while refetching so the UI never goes blank.
    placeholderData: (prev) => prev,
  });
}
